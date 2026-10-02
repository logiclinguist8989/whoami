/* Simulated Linux (bash) and Windows (CMD) terminals. Everything runs in memory in the browser. */
(function () {
  'use strict';

  // ==========================================================================
  // Shared helpers
  // ==========================================================================

  const SEED_TIME = new Date(2026, 9, 1, 9, 30);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad2 = n => String(n).padStart(2, '0');

  function makeDir(children, owner) {
    return { type: 'dir', children: children || {}, owner: owner || 'guest', mode: 0o755, mtime: SEED_TIME };
  }

  function makeFile(content, owner) {
    return { type: 'file', content: content, owner: owner || 'guest', mode: 0o644, mtime: SEED_TIME };
  }

  function clone(node) {
    if (node.type === 'file') return Object.assign({}, node, { mtime: new Date() });
    const children = {};
    Object.keys(node.children).forEach(k => { children[k] = clone(node.children[k]); });
    return Object.assign({}, node, { children, mtime: new Date() });
  }

  function globToRegExp(glob, caseInsensitive) {
    const body = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${body}$`, caseInsensitive ? 'i' : '');
  }

  const hasGlob = s => /[*?]/.test(s);

  function lines(text) {
    if (!text) return [];
    const list = text.split('\n');
    if (list[list.length - 1] === '') list.pop();
    return list;
  }

  const withNewline = text => (text === '' || text.endsWith('\n') ? text : text + '\n');

  // Deterministic "random" numbers so ping times look natural but stay stable in tests
  function seeded(seed) {
    let s = seed % 2147483647 || 1;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }

  function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  function fakeAddress(host) {
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
    if (/^localhost$/i.test(host)) return '127.0.0.1';
    // Documentation range: clearly not a real lookup
    return `203.0.113.${(hashString(host.toLowerCase()) % 250) + 1}`;
  }

  // ==========================================================================
  // Virtual file system
  // ==========================================================================

  class FileSystem {
    constructor(root, caseInsensitive) {
      this.root = root;
      this.ci = caseInsensitive;
    }

    key(dir, name) {
      if (!dir || dir.type !== 'dir') return null;
      if (Object.prototype.hasOwnProperty.call(dir.children, name)) return name;
      if (!this.ci) return null;
      const lower = name.toLowerCase();
      return Object.keys(dir.children).find(k => k.toLowerCase() === lower) || null;
    }

    get(segs) {
      let node = this.root;
      for (const seg of segs) {
        const k = this.key(node, seg);
        if (k === null) return null;
        node = node.children[k];
      }
      return node;
    }

    // Returns the canonical (stored) spelling of a path, for case-insensitive systems
    canonical(segs) {
      let node = this.root;
      const out = [];
      for (const seg of segs) {
        const k = this.key(node, seg);
        if (k === null) return segs;
        out.push(k);
        node = node.children[k];
      }
      return out;
    }

    sortedNames(dir) {
      return Object.keys(dir.children).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    }
  }

  // ==========================================================================
  // Command-line parsing (shared): words, quotes, |, >, >>, &&
  // ==========================================================================

  function tokenize(line, opts) {
    const tokens = [];
    let cur = '';
    let has = false;
    let quote = null;
    const push = () => {
      if (has) tokens.push({ t: 'w', v: cur });
      cur = '';
      has = false;
    };

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote) {
          quote = null;
          if (opts.keepQuotes) cur += ch;
        } else if (ch === '$' && quote === '"' && opts.dollar) {
          const m = /^\$(\{(\w+)\}|(\w+|\?))/.exec(line.slice(i));
          if (m) {
            cur += opts.dollar(m[2] || m[3]);
            i += m[0].length - 1;
          } else cur += ch;
        } else cur += ch;
        continue;
      }
      if (opts.quotes.includes(ch)) {
        quote = ch;
        has = true;
        if (opts.keepQuotes) cur += ch;
        continue;
      }
      if (/\s/.test(ch)) { push(); continue; }
      if (ch === '|') {
        push();
        if (line[i + 1] === '|') return { error: 'unsupported' };
        tokens.push({ t: '|' });
        continue;
      }
      if (ch === '>') {
        push();
        if (line[i + 1] === '>') { tokens.push({ t: '>>' }); i++; } else tokens.push({ t: '>' });
        continue;
      }
      if (ch === '&' && line[i + 1] === '&') { push(); tokens.push({ t: '&&' }); i++; continue; }
      if (ch === '$' && opts.dollar) {
        const m = /^\$(\{(\w+)\}|(\w+|\?))/.exec(line.slice(i));
        if (m) {
          cur += opts.dollar(m[2] || m[3]);
          has = true;
          i += m[0].length - 1;
          continue;
        }
      }
      cur += ch;
      has = true;
    }
    if (quote) return { error: 'quote' };
    push();
    return { tokens };
  }

  // Splits tokens into && chains of | pipelines, each stage { words, redirect }
  function parse(tokens) {
    const chains = [[]];
    let stage = { words: [], redirect: null };
    const finishStage = () => { chains[chains.length - 1].push(stage); stage = { words: [], redirect: null }; };

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.t === 'w') {
        if (stage.redirect && stage.redirect.target === null) stage.redirect.target = tok.v;
        else stage.words.push(tok.v);
      } else if (tok.t === '>' || tok.t === '>>') {
        if (stage.redirect) return { error: 'syntax' };
        stage.redirect = { append: tok.t === '>>', target: null };
      } else if (tok.t === '|') {
        if (!stage.words.length || (stage.redirect && stage.redirect.target === null)) return { error: 'syntax' };
        finishStage();
      } else if (tok.t === '&&') {
        if (!stage.words.length || (stage.redirect && stage.redirect.target === null)) return { error: 'syntax' };
        finishStage();
        chains.push([]);
      }
    }
    if (stage.redirect && stage.redirect.target === null) return { error: 'syntax' };
    if (!stage.words.length) {
      if (tokens.length) return { error: 'syntax' };
      return { chains: [] };
    }
    finishStage();
    return { chains };
  }

  const ok = (out = '') => ({ out, err: '', code: 0 });
  const fail = (err, code = 1, out = '') => ({ out, err, code });

  // ==========================================================================
  // Base shell: runs a line, handles pipes, redirects, && and history
  // ==========================================================================

  class Shell {
    constructor() {
      this.history = [];
    }

    run(line) {
      const trimmed = line.trim();
      if (!trimmed) return { out: '', err: '' };
      this.history.push(trimmed);

      const tokenized = tokenize(trimmed, this.tokenOptions());
      if (tokenized.error) return { out: '', err: this.syntaxError(tokenized.error) };
      const parsed = parse(tokenized.tokens);
      if (parsed.error) return { out: '', err: this.syntaxError(parsed.error) };

      let out = '';
      let err = '';
      let clear = false;
      for (const chain of parsed.chains) {
        let stdin = null;
        let code = 0;
        for (let s = 0; s < chain.length; s++) {
          const stage = chain[s];
          const result = this.exec(stage.words, stdin);
          if (result.clear) { clear = true; out = ''; err = ''; }
          if (result.err) err += withNewline(result.err);
          code = result.code;
          let stageOut = result.out || '';
          if (stage.redirect) {
            const w = this.redirect(stage.redirect, stageOut);
            if (w) { err += withNewline(w); code = 1; }
            stageOut = '';
          }
          if (s === chain.length - 1) out += stageOut;
          stdin = stageOut;
        }
        if (code !== 0) break;
        // Keep output from earlier && parts separate from later ones
        if (out && !out.endsWith('\n')) out += '\n';
      }
      return { out, err, clear };
    }

    exec(words, stdin) {
      const name = this.normalizeName(words[0]);
      const handler = this.commands[name];
      if (!handler) return this.unknown(words[0]);
      try {
        return handler.call(this, this.expandArgs(name, words.slice(1)), stdin, words[0]);
      } catch (e) {
        return fail(`${words[0]}: internal error`);
      }
    }

    complete(text) {
      const before = text.replace(/\S*$/, '');
      const word = text.slice(before.length);
      const isCommand = !before.trim() || /(\||&&)\s*$/.test(before);
      let candidates;
      if (isCommand) {
        candidates = Object.keys(this.commands)
          .filter(c => !this.hiddenCommands.includes(c))
          .filter(c => c.startsWith(word.toLowerCase()) || c.startsWith(word));
      } else {
        candidates = this.completePath(word);
      }
      if (!candidates.length) return { text, options: [] };
      if (candidates.length === 1) {
        const single = candidates[0];
        const suffix = single.endsWith(this.sep) ? '' : ' ';
        return { text: before + single + suffix, options: [] };
      }
      let common = candidates[0];
      for (const c of candidates) {
        while (!c.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
      }
      return { text: before + (common.length > word.length ? common : word), options: candidates.sort() };
    }

    completePath(word) {
      const cut = word.lastIndexOf(this.sep);
      const dirPart = cut >= 0 ? word.slice(0, cut + 1) : '';
      const namePart = cut >= 0 ? word.slice(cut + 1) : word;
      const dirSegs = this.resolve(dirPart || '.');
      if (!dirSegs) return [];
      const dir = this.fs.get(dirSegs);
      if (!dir || dir.type !== 'dir') return [];
      const lower = namePart.toLowerCase();
      return Object.keys(dir.children)
        .filter(n => (this.fs.ci ? n.toLowerCase().startsWith(lower) : n.startsWith(namePart)))
        .filter(n => namePart.startsWith('.') || !n.startsWith('.') || this.fs.ci)
        .map(n => dirPart + n + (dir.children[n].type === 'dir' ? this.sep : ''));
    }

    // Writes command output to a file for > and >>
    redirect(redirect, text) {
      const target = this.unquote(redirect.target);
      // The null device swallows output
      if (target === '/dev/null' || (this.fs.ci && /^nul$/i.test(target))) return '';
      const segs = this.resolve(target);
      if (!segs || !segs.length) return this.writeError(target, 'path');
      const parent = this.fs.get(segs.slice(0, -1));
      if (!parent || parent.type !== 'dir') return this.writeError(target, 'path');
      const key = this.fs.key(parent, segs[segs.length - 1]);
      const existing = key !== null ? parent.children[key] : null;
      if (existing && existing.type === 'dir') return this.writeError(target, 'isdir');
      if (!this.canWrite(existing || parent)) return this.writeError(target, 'denied');
      if (existing) {
        existing.content = redirect.append ? existing.content + text : text;
        existing.mtime = new Date();
      } else {
        parent.children[segs[segs.length - 1]] = makeFile(text);
      }
      return '';
    }

    unquote(s) {
      return s;
    }

    readInput(args, stdin, cmd) {
      // Returns [{ name, text }] from files, or stdin when no files are given
      if (!args.length) return { sources: stdin === null ? [] : [{ name: null, text: stdin }] };
      const sources = [];
      const errors = [];
      for (const a of args) {
        const segs = this.resolve(this.unquote(a));
        const node = segs && this.fs.get(segs);
        if (!node) errors.push(this.missingFile(cmd, a));
        else if (node.type === 'dir') errors.push(this.isDirectory(cmd, a));
        else sources.push({ name: this.unquote(a), text: node.content });
      }
      return { sources, errors };
    }
  }

  // ==========================================================================
  // Linux (bash)
  // ==========================================================================

  const HOME = ['home', 'guest'];

  function linuxFs() {
    const root = makeDir({
      bin: makeDir({}, 'root'),
      dev: makeDir({ null: Object.assign(makeFile('', 'root'), { mode: 0o666 }) }, 'root'),
      etc: makeDir({
        hostname: makeFile('portfolio\n', 'root'),
        hosts: makeFile('127.0.0.1\tlocalhost\n127.0.1.1\tportfolio\n\n# The following lines are desirable for IPv6 capable hosts\n::1\tip6-localhost ip6-loopback\n', 'root'),
        'os-release': makeFile('PRETTY_NAME="Ubuntu 24.04.1 LTS (simulated)"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n', 'root'),
        passwd: makeFile('root:x:0:0:root:/root:/bin/bash\nguest:x:1000:1000:Guest:/home/guest:/bin/bash\n', 'root'),
        shadow: Object.assign(makeFile('', 'root'), { mode: 0o640, secret: true })
      }, 'root'),
      home: makeDir({
        guest: makeDir({
          '.bashrc': makeFile('# ~/.bashrc\nalias ll=\'ls -l\'\nexport EDITOR=nano\n'),
          'about.txt': makeFile(
            'Ayush Hamal\n' +
            'IT Technician @ Gurans Herbaceuticals (Biratnagar, Nepal)\n' +
            'B.Tech Ed IT, Kathmandu University (2022-2026)\n' +
            'Builds secure full-stack software with Django, FastAPI and Python.\n'),
          'skills.txt': makeFile(
            'Python\nJavaScript\nBash\nC/C++\nDjango\nFastAPI\nFlask\nReact\nPostgreSQL\nMySQL\nRedis\n' +
            'Docker\nGit\nLinux hardening\nNetwork security\nBurp Suite\nPandas\nscikit-learn\n'),
          'contact.txt': makeFile(
            'Email:     ayushhamal.aspire.ku@gmail.com\n' +
            'GitHub:    github.com/logiclinguist8989\n' +
            'LinkedIn:  linkedin.com/in/ayush-hamal-623b4127b\n' +
            'TryHackMe: tryhackme.com/p/ayushhamalthakuri\n'),
          projects: makeDir({
            'gurans-sales.md': makeFile('# Gurans Sales Management System\nDjango 5 + PostgreSQL + Celery. 6-level RBAC, approval workflows, multi-currency pricing, audit logging.\n'),
            'safeclick.md': makeFile('# SafeClick\nPrivacy-first phishing & scam detection browser extension. FastAPI + Redis back-end.\n'),
            'cyberlens.md': makeFile('# CyberLens\nNetwork monitoring and vulnerability dashboard. Python, Flask, Docker.\n'),
            'pyportscan.md': makeFile('# PyPortScan\nPython port scanner for security auditing.\n'),
            'learning-analytics.md': makeFile('# Student Learning Analytics\nClustering and dropout prediction with scikit-learn.\n'),
            'exam-seating.md': makeFile('# Exam Seating Automation\nDjango platform for fair exam seating allocation.\n')
          }),
          notes: makeDir({
            'todo.txt': makeFile('[x] Patch office workstations\n[ ] Rotate backup drives\n[ ] Finish label artwork for new product\n')
          })
        })
      }, 'root'),
      tmp: Object.assign(makeDir({}, 'root'), { mode: 0o1777, worldWritable: true }),
      usr: makeDir({ bin: makeDir({}, 'root') }, 'root'),
      var: makeDir({
        log: makeDir({
          'auth.log': makeFile(
            'Oct  1 08:58:02 portfolio sshd[1021]: Accepted publickey for guest from 192.168.1.10 port 51122\n' +
            'Oct  1 09:12:44 portfolio sshd[1187]: Failed password for root from 203.0.113.45 port 40210 ssh2\n' +
            'Oct  1 09:12:47 portfolio sshd[1187]: Failed password for root from 203.0.113.45 port 40210 ssh2\n' +
            'Oct  1 09:12:51 portfolio sshd[1187]: Failed password for invalid user admin from 203.0.113.45 port 40214 ssh2\n' +
            'Oct  1 09:20:03 portfolio sudo:    guest : user NOT in sudoers ; TTY=pts/0 ; COMMAND=/bin/bash\n' +
            'Oct  1 09:31:15 portfolio sshd[1302]: Accepted publickey for guest from 192.168.1.10 port 51180\n', 'root'),
          syslog: makeFile(
            'Oct  1 08:55:00 portfolio systemd[1]: Started Daily apt download activities.\n' +
            'Oct  1 08:55:12 portfolio kernel: [    0.000000] Linux version 6.8.0-45-generic\n' +
            'Oct  1 09:00:00 portfolio CRON[1104]: (root) CMD (/usr/local/bin/backup.sh)\n' +
            'Oct  1 09:00:41 portfolio backup.sh[1104]: Backup completed: 2.4G written\n', 'root')
        }, 'root')
      }, 'root')
    }, 'root');
    root.children.home.children.guest.children['.bashrc'].mode = 0o644;
    return new FileSystem(root, false);
  }

  const LINUX_HELP = {
    help: ['help', 'List the commands this terminal understands.'],
    man: ['man COMMAND', 'Show the manual page for a command.'],
    ls: ['ls [-l] [-a] [PATH...]', 'List directory contents. -l long format, -a include hidden files.', 'dir'],
    cd: ['cd [DIR]', 'Change directory. No argument goes home; "cd -" goes back; ".." goes up.', 'cd'],
    pwd: ['pwd', 'Print the current working directory.', 'cd (with no arguments)'],
    cat: ['cat [FILE...]', 'Print file contents (or standard input).', 'type'],
    echo: ['echo [TEXT...]', 'Print text. Use > or >> to write it to a file.', 'echo'],
    touch: ['touch FILE...', 'Create empty files or update their timestamps.', 'type nul > FILE'],
    mkdir: ['mkdir [-p] DIR...', 'Create directories. -p creates parent directories as needed.', 'mkdir / md'],
    rm: ['rm [-r] [-f] PATH...', 'Remove files. -r removes directories recursively, -f ignores missing files.', 'del / rmdir /s'],
    rmdir: ['rmdir DIR...', 'Remove empty directories.', 'rmdir / rd'],
    cp: ['cp [-r] SOURCE DEST', 'Copy files. -r copies directories.', 'copy / xcopy'],
    mv: ['mv SOURCE DEST', 'Move or rename files and directories.', 'move / ren'],
    head: ['head [-n N] [FILE...]', 'Print the first lines (default 10).'],
    tail: ['tail [-n N] [FILE...]', 'Print the last lines (default 10).'],
    wc: ['wc [-l] [-w] [-c] [FILE...]', 'Count lines, words and bytes.', 'find /c /v ""'],
    grep: ['grep [-i] [-n] [-v] [-c] PATTERN [FILE...]', 'Print lines matching a pattern. -i ignore case, -n line numbers, -v invert, -c count.', 'findstr'],
    find: ['find [PATH] [-name GLOB] [-type f|d]', 'Search for files in a directory tree.', 'dir /s /b'],
    sort: ['sort [-r] [-n] [FILE...]', 'Sort lines. -r reverse, -n numeric.', 'sort'],
    uniq: ['uniq [-c] [FILE]', 'Remove adjacent duplicate lines. -c prefixes counts.'],
    tree: ['tree [PATH]', 'Show a directory tree.', 'tree /f'],
    chmod: ['chmod MODE FILE...', 'Change permissions, e.g. chmod 755 script.sh or chmod +x script.sh.', 'icacls'],
    whoami: ['whoami', 'Print the current user name.', 'whoami'],
    id: ['id', 'Print user and group IDs.'],
    hostname: ['hostname', 'Print the machine name.', 'hostname'],
    uname: ['uname [-a] [-r] [-s]', 'Print system information.', 'ver'],
    date: ['date', 'Print the current date and time.', 'date /t & time /t'],
    uptime: ['uptime', 'Show how long the system has been running.'],
    df: ['df [-h]', 'Show disk space usage.'],
    free: ['free [-h]', 'Show memory usage.', 'systeminfo'],
    ps: ['ps [aux]', 'List running processes.', 'tasklist'],
    kill: ['kill PID', 'Stop a process by its ID.', 'taskkill /pid PID'],
    ip: ['ip a', 'Show network interfaces and addresses.', 'ipconfig'],
    ifconfig: ['ifconfig', 'Show network interfaces (older tool, replaced by "ip a").', 'ipconfig'],
    ping: ['ping [-c N] HOST', 'Send test packets to a host (simulated).', 'ping'],
    which: ['which COMMAND', 'Show where a command lives.', 'where'],
    history: ['history', 'Show previously typed commands.', 'doskey /history'],
    env: ['env', 'Print environment variables.', 'set'],
    export: ['export NAME=VALUE', 'Set an environment variable. Use it with $NAME.', 'set NAME=VALUE'],
    clear: ['clear', 'Clear the screen. Shortcut: Ctrl+L.', 'cls'],
    neofetch: ['neofetch', 'Show system and portfolio info.'],
    sudo: ['sudo COMMAND', 'Run a command as an administrator (not allowed for guest).', 'runas'],
    exit: ['exit', 'Leave the shell.', 'exit']
  };

  class LinuxShell extends Shell {
    constructor() {
      super();
      this.name = 'linux';
      this.sep = '/';
      this.fs = linuxFs();
      this.cwd = HOME.slice();
      this.prevCwd = null;
      this.env = { USER: 'guest', HOME: '/home/guest', SHELL: '/bin/bash', LANG: 'en_US.UTF-8', PATH: '/usr/local/bin:/usr/bin:/bin', TERM: 'xterm-256color' };
      this.lastCode = 0;
      this.processes = [
        [1, 'root', '/sbin/init'], [412, 'root', '/usr/sbin/sshd -D'], [530, 'root', '/usr/sbin/cron -f'],
        [1288, 'guest', '-bash'], [1342, 'guest', 'python3 -m http.server 8000']
      ];
      this.commands = LINUX_COMMANDS;
      this.hiddenCommands = ['ll', 'printenv', 'vi', 'vim', 'nano', 'apt', 'apt-get', 'su', 'logout'];
    }

    banner() {
      return 'Welcome to Ubuntu 24.04.1 LTS (simulated in your browser)\n\n' +
        'Type "help" to see commands, "man <command>" to learn one, Tab to complete.\n' +
        'Try: ls -l   cat about.txt   grep -i failed /var/log/auth.log\n';
    }

    prompt() {
      return { user: 'guest@portfolio', path: this.displayPath(this.cwd), symbol: '$' };
    }

    displayPath(segs) {
      const p = '/' + segs.join('/');
      const home = '/' + HOME.join('/');
      if (p === home) return '~';
      if (p.startsWith(home + '/')) return '~' + p.slice(home.length);
      return p;
    }

    absPath(segs) {
      return '/' + segs.join('/');
    }

    tokenOptions() {
      return {
        quotes: ['"', "'"],
        dollar: name => (name === '?' ? String(this.lastCode) : name === 'PWD' ? this.absPath(this.cwd) : this.env[name] || '')
      };
    }

    syntaxError(kind) {
      if (kind === 'quote') return 'bash: unexpected EOF while looking for matching quote';
      if (kind === 'unsupported') return 'bash: "||" is not supported in this simulator';
      return 'bash: syntax error near unexpected token';
    }

    normalizeName(name) {
      return name;
    }

    resolve(path) {
      let segs;
      let rest = path;
      if (rest.startsWith('/')) segs = [];
      else if (rest === '~' || rest.startsWith('~/')) { segs = HOME.slice(); rest = rest.slice(1); }
      else segs = this.cwd.slice();
      for (const part of rest.split('/')) {
        if (!part || part === '.') continue;
        if (part === '..') segs.pop();
        else segs.push(part);
      }
      return segs;
    }

    canWrite(node) {
      return node.owner === 'guest' || !!node.worldWritable;
    }

    // bash expands * and ? before the command sees its arguments
    expandArgs(name, args) {
      const out = [];
      for (const a of args) {
        // find and grep take patterns, so they handle * themselves
        if (!hasGlob(a) || name === 'find' || name === 'grep') { out.push(a); continue; }
        const cut = a.lastIndexOf('/');
        const dirPart = cut >= 0 ? a.slice(0, cut + 1) : '';
        const pattern = cut >= 0 ? a.slice(cut + 1) : a;
        const dir = this.fs.get(this.resolve(dirPart || '.'));
        if (!dir || dir.type !== 'dir' || hasGlob(dirPart)) { out.push(a); continue; }
        const re = globToRegExp(pattern, false);
        const matches = this.fs.sortedNames(dir).filter(n => re.test(n) && (pattern.startsWith('.') || !n.startsWith('.')));
        if (matches.length) matches.forEach(m => out.push(dirPart + m));
        else out.push(a);
      }
      return out;
    }

    exec(words, stdin) {
      const result = super.exec(words, stdin);
      this.lastCode = result.code || 0;
      return result;
    }

    unknown(name) {
      const hint = LINUX_HINTS[name.toLowerCase()];
      return fail(`${name}: command not found${hint ? `\nHint: on Linux, use "${hint}" instead of "${name}".` : ''}`, 127);
    }

    missingFile(cmd, path) {
      return `${cmd}: ${path}: No such file or directory`;
    }

    isDirectory(cmd, path) {
      return `${cmd}: ${path}: Is a directory`;
    }

    writeError(target, kind) {
      if (kind === 'isdir') return `bash: ${target}: Is a directory`;
      if (kind === 'denied') return `bash: ${target}: Permission denied`;
      return `bash: ${target}: No such file or directory`;
    }

    // Splits "-la" style flags from operands; returns { flags:Set, values:{}, operands:[] }
    options(args, withValue) {
      const flags = new Set();
      const values = {};
      const operands = [];
      for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--') { operands.push(...args.slice(i + 1)); break; }
        if (/^-\d+$/.test(a) && withValue && withValue.includes('n')) { values.n = a.slice(1); continue; }
        if (a.startsWith('-') && a.length > 1 && !a.startsWith('--')) {
          for (let j = 1; j < a.length; j++) {
            const f = a[j];
            if (withValue && withValue.includes(f)) {
              values[f] = a.slice(j + 1) || args[++i];
              break;
            }
            flags.add(f);
          }
        } else operands.push(a);
      }
      return { flags, values, operands };
    }
  }

  const LINUX_HINTS = {
    dir: 'ls', cls: 'clear', type: 'cat', del: 'rm', erase: 'rm', copy: 'cp', move: 'mv', ren: 'mv', rename: 'mv',
    ipconfig: 'ip a', tasklist: 'ps', taskkill: 'kill', findstr: 'grep', ver: 'uname -a', systeminfo: 'uname -a',
    where: 'which', set: 'env', md: 'mkdir', rd: 'rmdir', notepad: 'cat (editors are not available here)',
    get: 'ls', 'get-childitem': 'ls', 'get-content': 'cat', 'get-process': 'ps', powershell: 'bash'
  };

  function permString(node) {
    const t = node.type === 'dir' ? 'd' : '-';
    const bits = ['r', 'w', 'x'];
    let s = '';
    for (let i = 8; i >= 0; i--) s += node.mode & (1 << i) ? bits[(8 - i) % 3] : '-';
    if (node.mode & 0o1000) s = s.slice(0, 8) + (node.mode & 1 ? 't' : 'T');
    return t + s;
  }

  function sizeOf(node) {
    return node.type === 'dir' ? 4096 : node.content.length;
  }

  function lsDate(d) {
    return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function linuxPing(host, count) {
    const addr = fakeAddress(host);
    const rand = seeded(hashString(host) + 7);
    const base = addr.startsWith('127.') ? 0.04 : 18 + rand() * 30;
    let out = `PING ${host} (${addr}) 56(84) bytes of data.\n`;
    const times = [];
    for (let i = 1; i <= count; i++) {
      const t = addr.startsWith('127.') ? base + rand() * 0.03 : base + rand() * 6;
      times.push(t);
      out += `64 bytes from ${addr}: icmp_seq=${i} ttl=${addr.startsWith('127.') ? 64 : 117} time=${t.toFixed(addr.startsWith('127.') ? 3 : 1)} ms\n`;
    }
    const min = Math.min(...times), max = Math.max(...times), avg = times.reduce((a, b) => a + b, 0) / times.length;
    out += `\n--- ${host} ping statistics ---\n${count} packets transmitted, ${count} received, 0% packet loss, time ${(count - 1) * 1001}ms\n`;
    out += `rtt min/avg/max/mdev = ${min.toFixed(3)}/${avg.toFixed(3)}/${max.toFixed(3)}/${((max - min) / 2).toFixed(3)} ms\n`;
    if (!/^(\d{1,3}(\.\d{1,3}){3}|localhost)$/i.test(host)) out += '(simulated: no real network traffic is sent)\n';
    return out;
  }

  const LINUX_COMMANDS = {
    help() {
      const names = Object.keys(LINUX_HELP);
      const width = Math.max(...names.map(n => n.length)) + 2;
      return ok('Available commands (type "man <command>" for details):\n\n' +
        names.map(n => `  ${n.padEnd(width)}${LINUX_HELP[n][1].split('.')[0]}`).join('\n') +
        '\n\nPipes (|), redirects (> and >>), && and $VARIABLES work. Up/Down for history, Tab to complete.\n');
    },

    man(args) {
      if (!args.length) return fail('What manual page do you want?\nFor example, try "man ls".');
      const page = LINUX_HELP[args[0]];
      if (!page) return fail(`No manual entry for ${args[0]}`, 16);
      let out = `NAME\n    ${args[0]} - ${page[1]}\n\nSYNOPSIS\n    ${page[0]}\n`;
      if (page[2]) out += `\nWINDOWS EQUIVALENT\n    ${page[2]}\n`;
      return ok(out);
    },

    ls(args) {
      const { flags, operands } = this.options(args);
      const long = flags.has('l');
      const all = flags.has('a');
      const targets = operands.length ? operands : ['.'];
      const blocks = [];
      const errors = [];
      const fileRows = [];

      const formatEntries = (entries) => {
        if (!long) return entries.map(e => e.name).join('  ');
        const sizeWidth = Math.max(...entries.map(e => String(sizeOf(e.node)).length), 1);
        return entries.map(e =>
          `${permString(e.node)} 1 ${e.node.owner.padEnd(5)} ${e.node.owner.padEnd(5)} ${String(sizeOf(e.node)).padStart(sizeWidth)} ${lsDate(e.node.mtime)} ${e.name}`
        ).join('\n');
      };

      for (const t of targets) {
        const node = this.fs.get(this.resolve(t));
        if (!node) { errors.push(`ls: cannot access '${t}': No such file or directory`); continue; }
        if (node.type === 'file') { fileRows.push({ name: t, node }); continue; }
        if (node.secret) { errors.push(`ls: cannot open directory '${t}': Permission denied`); continue; }
        let names = this.fs.sortedNames(node);
        if (!all) names = names.filter(n => !n.startsWith('.'));
        const entries = names.map(n => ({ name: n, node: node.children[n] }));
        if (all) {
          const parent = this.fs.get(this.resolve(t + '/..'));
          entries.unshift({ name: '.', node }, { name: '..', node: parent || node });
        }
        let text = entries.length ? formatEntries(entries) : '';
        if (long) text = `total ${entries.length * 4}` + (text ? '\n' + text : '');
        blocks.push({ name: t, text });
      }

      const parts = [];
      if (fileRows.length) parts.push(formatEntries(fileRows));
      const multiple = targets.length > 1;
      blocks.forEach(b => parts.push(multiple ? `${b.name}:\n${b.text}` : b.text));
      const out = parts.filter(p => p !== '').join('\n\n');
      return { out: out ? out + '\n' : '', err: errors.join('\n'), code: errors.length ? 2 : 0 };
    },

    ll(args) {
      return LINUX_COMMANDS.ls.call(this, ['-l', ...args]);
    },

    cd(args) {
      let target = args[0];
      if (args.length > 1) return fail('bash: cd: too many arguments');
      if (target === undefined || target === '~') target = '/' + HOME.join('/');
      if (target === '-') {
        if (!this.prevCwd) return fail('bash: cd: OLDPWD not set');
        const back = this.prevCwd;
        this.prevCwd = this.cwd;
        this.cwd = back;
        return ok(this.absPath(this.cwd) + '\n');
      }
      const segs = this.resolve(target);
      const node = this.fs.get(segs);
      if (!node) return fail(`bash: cd: ${target}: No such file or directory`);
      if (node.type !== 'dir') return fail(`bash: cd: ${target}: Not a directory`);
      if (node.secret) return fail(`bash: cd: ${target}: Permission denied`);
      this.prevCwd = this.cwd;
      this.cwd = segs;
      return ok();
    },

    pwd() {
      return ok(this.absPath(this.cwd) + '\n');
    },

    cat(args, stdin) {
      for (const a of args) {
        const node = this.fs.get(this.resolve(a));
        if (node && node.secret) return fail(`cat: ${a}: Permission denied`);
      }
      const { sources, errors = [] } = this.readInput(args, stdin, 'cat');
      return { out: sources.map(s => s.text).join(''), err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    echo(args) {
      let newline = true;
      if (args[0] === '-n') { newline = false; args = args.slice(1); }
      return ok(args.join(' ') + (newline ? '\n' : ''));
    },

    touch(args) {
      if (!args.length) return fail('touch: missing file operand');
      const errors = [];
      for (const a of args) {
        const segs = this.resolve(a);
        const parent = this.fs.get(segs.slice(0, -1));
        if (!parent || parent.type !== 'dir') { errors.push(`touch: cannot touch '${a}': No such file or directory`); continue; }
        const existing = parent.children[segs[segs.length - 1]];
        if (!this.canWrite(existing || parent)) { errors.push(`touch: cannot touch '${a}': Permission denied`); continue; }
        if (existing) existing.mtime = new Date();
        else parent.children[segs[segs.length - 1]] = makeFile('');
      }
      return { out: '', err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    mkdir(args) {
      const { flags, operands } = this.options(args);
      if (!operands.length) return fail('mkdir: missing operand');
      const errors = [];
      for (const a of operands) {
        const segs = this.resolve(a);
        if (flags.has('p')) {
          let node = this.fs.root;
          for (const seg of segs) {
            if (!node.children[seg]) {
              if (!this.canWrite(node)) { errors.push(`mkdir: cannot create directory '${a}': Permission denied`); break; }
              node.children[seg] = makeDir();
            } else if (node.children[seg].type !== 'dir') { errors.push(`mkdir: cannot create directory '${a}': Not a directory`); break; }
            node = node.children[seg];
          }
          continue;
        }
        const parent = this.fs.get(segs.slice(0, -1));
        const name = segs[segs.length - 1];
        if (!parent || parent.type !== 'dir') errors.push(`mkdir: cannot create directory '${a}': No such file or directory`);
        else if (parent.children[name]) errors.push(`mkdir: cannot create directory '${a}': File exists`);
        else if (!this.canWrite(parent)) errors.push(`mkdir: cannot create directory '${a}': Permission denied`);
        else parent.children[name] = makeDir();
      }
      return { out: '', err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    rm(args) {
      const { flags, operands } = this.options(args);
      const recursive = flags.has('r') || flags.has('R');
      const force = flags.has('f');
      if (!operands.length) return force ? ok() : fail('rm: missing operand');
      const errors = [];
      for (const a of operands) {
        const segs = this.resolve(a);
        if (!segs.length) {
          errors.push(recursive ? "rm: it is dangerous to operate recursively on '/'\nrm: use --no-preserve-root to override this failsafe" : "rm: cannot remove '/': Is a directory");
          continue;
        }
        const parent = this.fs.get(segs.slice(0, -1));
        const name = segs[segs.length - 1];
        const node = parent && parent.type === 'dir' ? parent.children[name] : null;
        if (!node) { if (!force) errors.push(`rm: cannot remove '${a}': No such file or directory`); continue; }
        if (node.type === 'dir' && !recursive) { errors.push(`rm: cannot remove '${a}': Is a directory`); continue; }
        if (!this.canWrite(parent)) { errors.push(`rm: cannot remove '${a}': Permission denied`); continue; }
        delete parent.children[name];
      }
      return { out: '', err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    rmdir(args) {
      if (!args.length) return fail('rmdir: missing operand');
      const errors = [];
      for (const a of args) {
        const segs = this.resolve(a);
        const parent = this.fs.get(segs.slice(0, -1));
        const name = segs[segs.length - 1];
        const node = parent && parent.children[name];
        if (!node) errors.push(`rmdir: failed to remove '${a}': No such file or directory`);
        else if (node.type !== 'dir') errors.push(`rmdir: failed to remove '${a}': Not a directory`);
        else if (Object.keys(node.children).length) errors.push(`rmdir: failed to remove '${a}': Directory not empty`);
        else if (!this.canWrite(parent)) errors.push(`rmdir: failed to remove '${a}': Permission denied`);
        else delete parent.children[name];
      }
      return { out: '', err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    cp(args) {
      return linuxCopyMove.call(this, args, 'cp');
    },

    mv(args) {
      return linuxCopyMove.call(this, args, 'mv');
    },

    head(args, stdin) {
      return headTail.call(this, args, stdin, 'head');
    },

    tail(args, stdin) {
      return headTail.call(this, args, stdin, 'tail');
    },

    wc(args, stdin) {
      const { flags, operands } = this.options(args);
      const { sources, errors = [] } = this.readInput(operands, stdin, 'wc');
      const pick = flags.size ? ['l', 'w', 'c'].filter(f => flags.has(f)) : ['l', 'w', 'c'];
      const count = text => ({ l: (text.match(/\n/g) || []).length, w: (text.match(/\S+/g) || []).length, c: text.length });
      const rows = sources.map(s => ({ name: s.name, n: count(s.text) }));
      if (rows.length > 1) {
        rows.push({ name: 'total', n: rows.reduce((t, r) => ({ l: t.l + r.n.l, w: t.w + r.n.w, c: t.c + r.n.c }), { l: 0, w: 0, c: 0 }) });
      }
      const width = Math.max(...rows.map(r => Math.max(...pick.map(p => String(r.n[p]).length))), 1);
      const out = rows.map(r => pick.map(p => String(r.n[p]).padStart(pick.length > 1 || rows.length > 1 ? Math.max(width, 3) : 0)).join(' ') + (r.name ? ' ' + r.name : '')).join('\n');
      return { out: out ? out + '\n' : '', err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    grep(args, stdin) {
      const { flags, operands } = this.options(args);
      if (!operands.length) return fail('Usage: grep [-i] [-n] [-v] [-c] PATTERN [FILE...]', 2);
      const pattern = operands[0];
      let re;
      try { re = new RegExp(pattern, flags.has('i') ? 'i' : ''); } catch (e) {
        re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.has('i') ? 'i' : '');
      }
      const files = this.expandArgs('cat', operands.slice(1));
      for (const f of files) {
        const node = this.fs.get(this.resolve(f));
        if (node && node.secret) return fail(`grep: ${f}: Permission denied`, 2);
      }
      const { sources, errors = [] } = this.readInput(files, stdin, 'grep');
      const multi = sources.length > 1;
      let out = '';
      let total = 0;
      for (const s of sources) {
        let count = 0;
        lines(s.text).forEach((line, i) => {
          if (re.test(line) !== flags.has('v')) {
            count++;
            if (!flags.has('c')) out += `${multi ? s.name + ':' : ''}${flags.has('n') ? i + 1 + ':' : ''}${line}\n`;
          }
        });
        if (flags.has('c')) out += `${multi ? s.name + ':' : ''}${count}\n`;
        total += count;
      }
      return { out, err: errors.join('\n'), code: errors.length ? 2 : total ? 0 : 1 };
    },

    find(args) {
      let start = '.';
      let i = 0;
      if (args[0] && !args[0].startsWith('-')) { start = args[0]; i = 1; }
      let nameRe = null;
      let type = null;
      for (; i < args.length; i++) {
        if (args[i] === '-name' || args[i] === '-iname') {
          if (args[i + 1] === undefined) return fail(`find: missing argument to \`${args[i]}'`);
          nameRe = globToRegExp(args[i + 1], args[i] === '-iname');
          i++;
        } else if (args[i] === '-type') {
          type = args[++i];
          if (type !== 'f' && type !== 'd') return fail(`find: Unknown argument to -type: ${type}`);
        } else return fail(`find: unknown predicate \`${args[i]}'`);
      }
      const node = this.fs.get(this.resolve(start));
      if (!node) return fail(`find: '${start}': No such file or directory`);
      const results = [];
      const walk = (n, path, name) => {
        const typeOk = !type || (type === 'd' ? n.type === 'dir' : n.type === 'file');
        if (typeOk && (!nameRe || nameRe.test(name))) results.push(path);
        if (n.type === 'dir') this.fs.sortedNames(n).forEach(c => walk(n.children[c], `${path.replace(/\/$/, '')}/${c}`, c));
      };
      walk(node, start, start.split('/').filter(Boolean).pop() || start);
      return ok(results.length ? results.join('\n') + '\n' : '');
    },

    sort(args, stdin) {
      const { flags, operands } = this.options(args);
      const { sources, errors = [] } = this.readInput(operands, stdin, 'sort');
      let all = [];
      sources.forEach(s => { all = all.concat(lines(s.text)); });
      if (flags.has('n')) all.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
      else all.sort((a, b) => a.localeCompare(b));
      if (flags.has('r')) all.reverse();
      return { out: all.length ? all.join('\n') + '\n' : '', err: errors.join('\n'), code: errors.length ? 2 : 0 };
    },

    uniq(args, stdin) {
      const { flags, operands } = this.options(args);
      const { sources, errors = [] } = this.readInput(operands.slice(0, 1), stdin, 'uniq');
      const all = sources.length ? lines(sources[0].text) : [];
      const out = [];
      for (const line of all) {
        const last = out[out.length - 1];
        if (last && last.line === line) last.n++;
        else out.push({ line, n: 1 });
      }
      const text = out.map(o => (flags.has('c') ? `${String(o.n).padStart(7)} ${o.line}` : o.line)).join('\n');
      return { out: text ? text + '\n' : '', err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    tree(args) {
      const start = args[0] || '.';
      const node = this.fs.get(this.resolve(start));
      if (!node || node.type !== 'dir') return fail(`${start} [error opening dir]\n\n0 directories, 0 files`);
      let dirs = 0;
      let files = 0;
      let out = start + '\n';
      const walk = (n, prefix) => {
        const names = this.fs.sortedNames(n).filter(x => !x.startsWith('.'));
        names.forEach((name, i) => {
          const last = i === names.length - 1;
          out += `${prefix}${last ? '└── ' : '├── '}${name}\n`;
          const child = n.children[name];
          if (child.type === 'dir') { dirs++; walk(child, prefix + (last ? '    ' : '│   ')); } else files++;
        });
      };
      walk(node, '');
      return ok(`${out}\n${dirs} director${dirs === 1 ? 'y' : 'ies'}, ${files} file${files === 1 ? '' : 's'}\n`);
    },

    chmod(args) {
      if (args.length < 2) return fail("chmod: missing operand\nTry 'chmod 755 FILE' or 'chmod +x FILE'.");
      const mode = args[0];
      const errors = [];
      for (const a of args.slice(1)) {
        const node = this.fs.get(this.resolve(a));
        if (!node) { errors.push(`chmod: cannot access '${a}': No such file or directory`); continue; }
        if (node.owner !== 'guest') { errors.push(`chmod: changing permissions of '${a}': Operation not permitted`); continue; }
        if (/^[0-7]{3,4}$/.test(mode)) { node.mode = parseInt(mode, 8); continue; }
        const m = /^([ugoa]*)([+-=])([rwx]+)$/.exec(mode);
        if (!m) return fail(`chmod: invalid mode: '${mode}'`);
        const who = m[1] || 'a';
        let mask = 0;
        const bit = { r: 4, w: 2, x: 1 };
        for (const p of m[3]) {
          const v = bit[p];
          if (who.includes('u') || who.includes('a')) mask |= v << 6;
          if (who.includes('g') || who.includes('a')) mask |= v << 3;
          if (who.includes('o') || who.includes('a')) mask |= v;
        }
        if (m[2] === '+') node.mode |= mask;
        else if (m[2] === '-') node.mode &= ~mask;
        else node.mode = (node.mode & 0o7000) | mask;
      }
      return { out: '', err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    whoami() { return ok('guest\n'); },
    id() { return ok('uid=1000(guest) gid=1000(guest) groups=1000(guest)\n'); },
    hostname() { return ok('portfolio\n'); },

    uname(args) {
      const { flags } = this.options(args);
      if (flags.has('a')) return ok('Linux portfolio 6.8.0-45-generic #45-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n');
      if (flags.has('r')) return ok('6.8.0-45-generic\n');
      return ok('Linux\n');
    },

    date() {
      const d = new Date();
      const off = -d.getTimezoneOffset();
      const tz = `${off >= 0 ? '+' : '-'}${pad2(Math.floor(Math.abs(off) / 60))}${pad2(Math.abs(off) % 60)}`;
      return ok(`${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${tz} ${d.getFullYear()}\n`);
    },

    uptime() {
      const d = new Date();
      return ok(` ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} up 3 days,  2:14,  1 user,  load average: 0.08, 0.03, 0.01\n`);
    },

    df() {
      return ok('Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda2        98G   41G   52G  45% /\ntmpfs           3.9G     0  3.9G   0% /dev/shm\n/dev/sda1       511M  6.1M  505M   2% /boot/efi\n');
    },

    free() {
      return ok('               total        used        free      shared  buff/cache   available\nMem:           7.7Gi       2.1Gi       3.6Gi       112Mi       2.0Gi       5.3Gi\nSwap:          2.0Gi          0B       2.0Gi\n');
    },

    ps(args) {
      const full = args.some(a => /a|u|x/.test(a));
      if (!full) {
        return ok('    PID TTY          TIME CMD\n' + this.processes.filter(p => p[1] === 'guest').map(p => `${String(p[0]).padStart(7)} pts/0    00:00:00 ${p[2].split(' ')[0].replace(/^-/, '')}`).join('\n') + `\n${String(1400 + this.history.length).padStart(7)} pts/0    00:00:00 ps\n`);
      }
      return ok('USER         PID %CPU %MEM COMMAND\n' + this.processes.map(p => `${p[1].padEnd(8)} ${String(p[0]).padStart(7)}  0.0  0.1 ${p[2]}`).join('\n') + `\nguest    ${String(1400 + this.history.length).padStart(7)}  0.0  0.0 ps aux\n`);
    },

    kill(args) {
      const pid = Number(args.filter(a => !a.startsWith('-'))[0]);
      if (!pid) return fail('kill: usage: kill [-9] PID');
      const idx = this.processes.findIndex(p => p[0] === pid);
      if (idx < 0) return fail(`bash: kill: (${pid}) - No such process`);
      if (this.processes[idx][1] !== 'guest') return fail(`bash: kill: (${pid}) - Operation not permitted`);
      this.processes.splice(idx, 1);
      return ok();
    },

    ip(args) {
      if (!args.length || !/^(a|addr|address)$/.test(args[0])) return fail('Usage: ip a   (show addresses)');
      return ok('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 state UNKNOWN\n    inet 127.0.0.1/8 scope host lo\n' +
        '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP\n    link/ether 52:54:00:3a:9c:21 brd ff:ff:ff:ff:ff:ff\n' +
        '    inet 192.168.1.42/24 brd 192.168.1.255 scope global dynamic eth0\n');
    },

    ifconfig() {
      return ok('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.1.42  netmask 255.255.255.0  broadcast 192.168.1.255\n        ether 52:54:00:3a:9c:21  txqueuelen 1000  (Ethernet)\n\n' +
        'lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0\n');
    },

    ping(args) {
      const { values, operands } = this.options(args, ['c']);
      if (!operands.length) return fail('ping: usage error: Destination address required', 2);
      const count = Math.min(Math.max(parseInt(values.c, 10) || 4, 1), 10);
      return ok(linuxPing(operands[0], count));
    },

    which(args) {
      const builtins = ['cd', 'echo', 'export', 'history', 'help', 'exit', 'pwd'];
      const found = args.filter(a => LINUX_COMMANDS[a] && !builtins.includes(a));
      return { out: found.map(a => `/usr/bin/${a}`).join('\n') + (found.length ? '\n' : ''), err: '', code: found.length === args.length && args.length ? 0 : 1 };
    },

    history() {
      return ok(this.history.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join('\n') + '\n');
    },

    env() {
      return ok(Object.keys(this.env).map(k => `${k}=${this.env[k]}`).join('\n') + `\nPWD=${this.absPath(this.cwd)}\n`);
    },

    printenv(args) {
      if (args.length) return this.env[args[0]] ? ok(this.env[args[0]] + '\n') : fail('', 1);
      return LINUX_COMMANDS.env.call(this);
    },

    export(args) {
      if (!args.length) return LINUX_COMMANDS.env.call(this);
      for (const a of args) {
        const m = /^([A-Za-z_]\w*)=(.*)$/.exec(a);
        if (!m) return fail(`bash: export: \`${a}': not a valid identifier`);
        this.env[m[1]] = m[2];
      }
      return ok();
    },

    clear() { return { out: '', err: '', code: 0, clear: true }; },

    neofetch() {
      return ok(
        '        .-/+oossssoo+/-.        guest@portfolio\n' +
        '    `:+ssssssssssssssssss+:`    ---------------\n' +
        '  -+ssssssssssssssssssyyssss+-  OS: Ubuntu 24.04.1 LTS (simulated)\n' +
        ' .ossssssssssssssssssdMMMNysso. Host: Ayush Hamal\'s portfolio\n' +
        '/ssssssssssshdmmNNmmyNMMMMhssss Role: IT Technician @ Gurans Herbaceuticals\n' +
        '+sssssssshmydMMMMMMMNddddyssss+ Education: B.Tech Ed IT, Kathmandu University\n' +
        '/sssssssshNMMMyhhyyyyhmNMMMNhss Shell: bash 5.2\n' +
        '.ssssssssdMMMNhsssssssssshNMMMd Projects: 7\n' +
        ' -+sssssssshNMMMyhhyyyyhdNMMMNh TryHackMe: Top 6%\n' +
        '   `:+ssssssssdNMMMMMMMNdhssss  Location: Biratnagar, Nepal\n');
    },

    sudo(args) {
      if (!args.length) return fail('usage: sudo command');
      return fail('[sudo] password for guest: \nguest is not in the sudoers file.  This incident will be reported.');
    },

    su() { return fail('su: Authentication failure'); },

    nano(args) { return fail(`${args[0] || 'nano'}: text editors can't run in this simulator. Use "cat" to read files and "echo text > file" to write them.`); },
    vi(args) { return LINUX_COMMANDS.nano.call(this, args); },
    vim(args) { return LINUX_COMMANDS.nano.call(this, args); },

    apt() {
      return fail('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)\nE: Unable to acquire the dpkg frontend lock, are you root?', 100);
    },
    'apt-get'() { return LINUX_COMMANDS.apt.call(this); },

    exit() {
      return ok('logout\n(This is a simulated terminal, so there is nowhere to go. Type "help" to keep exploring.)\n');
    },
    logout() { return LINUX_COMMANDS.exit.call(this); }
  };

  function headTail(args, stdin, which) {
    const { values, operands } = this.options(args, ['n']);
    const n = values.n === undefined ? 10 : parseInt(values.n, 10);
    if (Number.isNaN(n) || n < 0) return fail(`${which}: invalid number of lines: '${values.n}'`);
    const { sources, errors = [] } = this.readInput(operands, stdin, which);
    const multi = sources.length > 1;
    const out = sources.map(s => {
      const all = lines(s.text);
      const pick = which === 'head' ? all.slice(0, n) : all.slice(Math.max(all.length - n, 0));
      return (multi ? `==> ${s.name} <==\n` : '') + pick.map(l => l + '\n').join('');
    }).join(multi ? '\n' : '');
    return { out, err: errors.join('\n'), code: errors.length ? 1 : 0 };
  }

  function linuxCopyMove(args, cmd) {
    const { flags, operands } = this.options(args);
    if (operands.length < 2) return fail(`${cmd}: missing ${operands.length ? 'destination file operand after \'' + operands[0] + '\'' : 'file operand'}`);
    const dest = operands[operands.length - 1];
    const sources = operands.slice(0, -1);
    const destSegs = this.resolve(dest);
    const destNode = this.fs.get(destSegs);
    if (sources.length > 1 && (!destNode || destNode.type !== 'dir')) return fail(`${cmd}: target '${dest}' is not a directory`);
    const errors = [];
    for (const src of sources) {
      const srcSegs = this.resolve(src);
      const srcParent = this.fs.get(srcSegs.slice(0, -1));
      const srcName = srcSegs[srcSegs.length - 1];
      const node = srcParent && srcParent.children[srcName];
      if (!node) { errors.push(`${cmd}: cannot stat '${src}': No such file or directory`); continue; }
      if (node.secret) { errors.push(`${cmd}: cannot open '${src}' for reading: Permission denied`); continue; }
      if (cmd === 'cp' && node.type === 'dir' && !flags.has('r') && !flags.has('R')) { errors.push(`cp: -r not specified; omitting directory '${src}'`); continue; }
      let targetParent;
      let targetName;
      if (destNode && destNode.type === 'dir') { targetParent = destNode; targetName = srcName; } else {
        targetParent = this.fs.get(destSegs.slice(0, -1));
        targetName = destSegs[destSegs.length - 1];
      }
      if (!targetParent || targetParent.type !== 'dir') { errors.push(`${cmd}: cannot create '${dest}': No such file or directory`); continue; }
      const insideItself = node.type === 'dir' && this.absPath(destSegs).startsWith(this.absPath(srcSegs) + '/');
      if (insideItself) { errors.push(`${cmd}: cannot ${cmd === 'cp' ? 'copy' : 'move'} a directory, '${src}', into itself`); continue; }
      if (!this.canWrite(targetParent) || (cmd === 'mv' && !this.canWrite(srcParent))) { errors.push(`${cmd}: cannot ${cmd === 'cp' ? 'create regular file' : 'move'} '${dest}': Permission denied`); continue; }
      const existing = targetParent.children[targetName];
      if (existing && existing.type === 'dir' && node.type !== 'dir') { errors.push(`${cmd}: cannot overwrite directory '${dest}' with non-directory`); continue; }
      if (existing === node) continue;
      targetParent.children[targetName] = cmd === 'cp' ? clone(node) : node;
      if (cmd === 'mv') { delete srcParent.children[srcName]; node.mtime = new Date(); }
    }
    return { out: '', err: errors.join('\n'), code: errors.length ? 1 : 0 };
  }

  // ==========================================================================
  // Windows (CMD)
  // ==========================================================================

  const WIN_HOME = ['Users', 'guest'];

  function windowsFs() {
    const sys = (children) => makeDir(children, 'system');
    const root = sys({
      'Program Files': sys({ 'Common Files': sys({}), 'Windows Defender': sys({}) }),
      Logs: makeDir({
        'backup.log': makeFile(
          '2026-10-01 09:00:02 INFO  Backup job started (D:\\Backups)\n' +
          '2026-10-01 09:00:41 INFO  2.4 GB copied\n' +
          '2026-10-01 09:00:42 WARN  1 file skipped: locked by another process\n' +
          '2026-10-01 09:00:42 INFO  Backup job finished\n')
      }),
      Users: sys({
        guest: makeDir({
          Desktop: makeDir({
            'readme.txt': makeFile('Welcome! This is a simulated Windows command prompt.\r\nType HELP to list commands, or HELP <command> for details.\r\n'.replace(/\r/g, ''))
          }),
          Documents: makeDir({
            'about.txt': makeFile(
              'Ayush Hamal\n' +
              'IT Technician @ Gurans Herbaceuticals (Biratnagar, Nepal)\n' +
              'B.Tech Ed IT, Kathmandu University (2022-2026)\n' +
              'Also designs duplex cartons and product labels.\n'),
            'contact.txt': makeFile(
              'Email:     ayushhamal.aspire.ku@gmail.com\n' +
              'GitHub:    github.com/logiclinguist8989\n' +
              'LinkedIn:  linkedin.com/in/ayush-hamal-623b4127b\n'),
            Projects: makeDir({
              'Gurans-Sales.txt': makeFile('Gurans Sales Management System - Django 5, PostgreSQL, Celery.\n'),
              'SafeClick.txt': makeFile('SafeClick - phishing & scam detection browser extension.\n'),
              'CyberLens.txt': makeFile('CyberLens - network monitoring and vulnerability dashboard.\n'),
              'PyPortScan.txt': makeFile('PyPortScan - Python port scanner.\n')
            })
          }),
          Downloads: makeDir({})
        })
      }),
      Windows: sys({
        System32: sys({
          drivers: sys({ etc: sys({ hosts: makeFile('# Hosts file: maps host names to IP addresses.\n#\n# localhost name resolution is handled within DNS itself.\n#\t127.0.0.1       localhost\n#\t::1             localhost\n', 'system') }) })
        }),
        Temp: sys({})
      })
    });
    return new FileSystem(root, true);
  }

  const WIN_HELP = {
    CD: ['CD [path]', 'Displays the name of or changes the current directory. CD .. goes up, CD \\ goes to the root.', 'cd / pwd'],
    CHDIR: ['CHDIR [path]', 'Same as CD.', 'cd'],
    CLS: ['CLS', 'Clears the screen.', 'clear'],
    COPY: ['COPY source destination', 'Copies one or more files to another location.', 'cp'],
    DATE: ['DATE /T', 'Displays the date.', 'date'],
    DEL: ['DEL [/Q] files', 'Deletes one or more files. Wildcards like *.txt work.', 'rm'],
    DIR: ['DIR [path] [/B] [/S]', 'Displays a list of files and subdirectories. /B bare names, /S include subfolders.', 'ls / find'],
    ECHO: ['ECHO [message]', 'Displays messages. Use > or >> to write to a file.', 'echo'],
    ERASE: ['ERASE [/Q] files', 'Same as DEL.', 'rm'],
    EXIT: ['EXIT', 'Quits the command prompt.', 'exit'],
    FIND: ['FIND [/I] [/C] [/N] [/V] "string" [file]', 'Searches for a text string in files or piped input.', 'grep'],
    FINDSTR: ['FINDSTR [/I] [/N] [/V] string [files]', 'Searches for strings in files or piped input.', 'grep'],
    HELP: ['HELP [command]', 'Provides help information for Windows commands.', 'man / help'],
    HOSTNAME: ['HOSTNAME', 'Prints the name of the current host.', 'hostname'],
    IPCONFIG: ['IPCONFIG [/ALL]', 'Displays network adapter configuration.', 'ip a'],
    MD: ['MD path', 'Same as MKDIR.', 'mkdir'],
    MKDIR: ['MKDIR path', 'Creates a directory (and any missing parent directories).', 'mkdir -p'],
    MORE: ['MORE file', 'Displays output one screen at a time.', 'less'],
    MOVE: ['MOVE source destination', 'Moves files and renames files and directories.', 'mv'],
    PING: ['PING [-n count] host', 'Sends test packets to a host (simulated).', 'ping'],
    RD: ['RD [/S] [/Q] path', 'Same as RMDIR.', 'rmdir / rm -r'],
    REN: ['REN oldname newname', 'Renames a file or directory.', 'mv'],
    RENAME: ['RENAME oldname newname', 'Same as REN.', 'mv'],
    RMDIR: ['RMDIR [/S] [/Q] path', 'Removes a directory. /S removes everything inside it.', 'rmdir / rm -r'],
    SET: ['SET [name[=value]]', 'Displays or sets environment variables. Use them as %name%.', 'env / export'],
    SORT: ['SORT [/R] [file]', 'Sorts input.', 'sort'],
    SYSTEMINFO: ['SYSTEMINFO', 'Displays operating system configuration information.', 'uname -a / free'],
    TASKKILL: ['TASKKILL /PID pid | /IM name', 'Ends a running process.', 'kill'],
    TASKLIST: ['TASKLIST', 'Displays currently running processes.', 'ps aux'],
    TIME: ['TIME /T', 'Displays the time.', 'date'],
    TREE: ['TREE [path] [/F]', 'Graphically displays the folder structure. /F includes files.', 'tree'],
    TYPE: ['TYPE file', 'Displays the contents of a text file.', 'cat'],
    VER: ['VER', 'Displays the Windows version.', 'uname -a'],
    WHERE: ['WHERE command', 'Displays the location of programs.', 'which'],
    WHOAMI: ['WHOAMI', 'Displays the current user name.', 'whoami']
  };

  const WIN_HINTS = {
    ls: 'dir', cat: 'type', clear: 'cls', rm: 'del', cp: 'copy', mv: 'move', pwd: 'cd', grep: 'findstr',
    ifconfig: 'ipconfig', ip: 'ipconfig', ps: 'tasklist', kill: 'taskkill', uname: 'ver', which: 'where',
    touch: 'type nul > file', man: 'help', env: 'set', export: 'set', history: 'doskey /history',
    nano: 'notepad (not available here) or type', vim: 'type', vi: 'type', sudo: 'runas', head: 'more',
    tail: 'more', wc: 'find /c /v ""', chmod: 'icacls', df: 'systeminfo', free: 'systeminfo', ll: 'dir'
  };

  function winDate(d) {
    return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()}`;
  }

  function winTime(d) {
    const h = d.getHours() % 12 || 12;
    return `${pad2(h)}:${pad2(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
  }

  const fmtNum = n => n.toLocaleString('en-US');

  class WindowsShell extends Shell {
    constructor() {
      super();
      this.name = 'windows';
      this.sep = '\\';
      this.fs = windowsFs();
      this.cwd = WIN_HOME.slice();
      this.env = {
        USERNAME: 'guest', USERPROFILE: 'C:\\Users\\guest', COMPUTERNAME: 'PORTFOLIO', OS: 'Windows_NT',
        PATH: 'C:\\Windows\\system32;C:\\Windows', SystemRoot: 'C:\\Windows', TEMP: 'C:\\Windows\\Temp', HOMEDRIVE: 'C:'
      };
      this.processes = [
        ['System Idle Process', 0, 'Services', '8 K'], ['System', 4, 'Services', '152 K'], ['svchost.exe', 1012, 'Services', '24,316 K'],
        ['explorer.exe', 4120, 'Console', '98,204 K'], ['MsMpEng.exe', 2876, 'Services', '187,412 K'], ['cmd.exe', 6240, 'Console', '4,880 K'],
        ['notepad.exe', 7016, 'Console', '14,512 K']
      ];
      this.commands = WIN_COMMANDS;
      this.hiddenCommands = ['doskey', 'notepad', 'runas', 'powershell', 'cls'];
    }

    banner() {
      return 'Windows Command Prompt (simulated in your browser)\n\n' +
        'Type HELP to list commands, HELP <command> or <command> /? for details, Tab to complete.\n' +
        'Try: dir   type Documents\\about.txt   tasklist | findstr exe\n';
    }

    prompt() {
      return { user: '', path: this.absPath(this.cwd), symbol: '>' };
    }

    absPath(segs) {
      return 'C:\\' + this.fs.canonical(segs).join('\\');
    }

    tokenOptions() {
      return { quotes: ['"'], keepQuotes: true };
    }

    run(line) {
      // CMD expands %VAR% before parsing
      const expanded = line.replace(/%([^%\s]+)%/g, (m, name) => {
        const key = Object.keys(this.env).find(k => k.toLowerCase() === name.toLowerCase());
        if (key) return this.env[key];
        if (/^cd$/i.test(name)) return this.absPath(this.cwd);
        if (/^date$/i.test(name)) return `${DAYS[new Date().getDay()]} ${winDate(new Date())}`;
        return m;
      });
      return super.run(expanded);
    }

    syntaxError(kind) {
      if (kind === 'quote') return 'The syntax of the command is incorrect.';
      if (kind === 'unsupported') return '"||" is not supported in this simulator.';
      return 'The syntax of the command is incorrect.';
    }

    normalizeName(name) {
      const n = this.unquote(name).toLowerCase();
      // "cd.." and "cd\" work in CMD without a space
      if (/^cd(\.\.|\\)/.test(n)) return 'cd';
      return n.replace(/\.exe$/, '');
    }

    exec(words, stdin) {
      const first = this.unquote(words[0]);
      const m = /^(cd)(\.\.|\\.*)$/i.exec(first);
      if (m) words = [m[1], m[2], ...words.slice(1)];
      const name = this.normalizeName(words[0]);
      if (words.slice(1).includes('/?') && WIN_HELP[name.toUpperCase()]) {
        return WIN_COMMANDS.help.call(this, [name]);
      }
      if (/^echo[.:]$/i.test(first)) return ok('\n');
      return super.exec(words, stdin);
    }

    unquote(s) {
      return s.replace(/"/g, '');
    }

    resolve(path) {
      let p = this.unquote(path).replace(/\//g, '\\');
      let segs;
      const drive = /^([a-zA-Z]):/.exec(p);
      if (drive) {
        if (drive[1].toUpperCase() !== 'C') return null;
        p = p.slice(2);
        segs = p.startsWith('\\') ? [] : this.cwd.slice();
      } else if (p.startsWith('\\')) segs = [];
      else segs = this.cwd.slice();
      for (const part of p.split('\\')) {
        if (!part || part === '.') continue;
        if (part === '..') segs.pop();
        else segs.push(part);
      }
      return segs;
    }

    canWrite(node) {
      return node.owner !== 'system';
    }

    expandArgs(name, args) {
      return args;
    }

    unknown(name) {
      const hint = WIN_HINTS[this.unquote(name).toLowerCase()];
      return fail(`'${this.unquote(name)}' is not recognized as an internal or external command,\noperable program or batch file.${hint ? `\nHint: on Windows, use "${hint}" instead of "${this.unquote(name)}".` : ''}`, 9009);
    }

    missingFile() {
      return 'The system cannot find the file specified.';
    }

    isDirectory() {
      return 'Access is denied.';
    }

    writeError(target, kind) {
      if (kind === 'denied' || kind === 'isdir') return 'Access is denied.';
      return 'The system cannot find the path specified.';
    }

    // Separates /switches from operands
    switches(args) {
      const flags = new Set();
      const operands = [];
      for (const a of args) {
        if (/^\/[a-zA-Z?]/.test(a) && !/^\/[a-zA-Z]:/.test(a)) {
          a.slice(1).split('/').forEach(f => flags.add(f.toUpperCase()));
        } else operands.push(a);
      }
      return { flags, operands };
    }

    // Expands a path with wildcards in its last part into [{ segs, node, parent, name }]
    matchPaths(path) {
      const segs = this.resolve(path);
      if (!segs) return null;
      const last = segs[segs.length - 1];
      if (last && hasGlob(last)) {
        const parent = this.fs.get(segs.slice(0, -1));
        if (!parent || parent.type !== 'dir') return null;
        const re = globToRegExp(last, true);
        return this.fs.sortedNames(parent).filter(n => re.test(n)).map(n => ({ segs: [...segs.slice(0, -1), n], node: parent.children[n], parent, name: n }));
      }
      const node = this.fs.get(segs);
      if (!node) return [];
      const parent = segs.length ? this.fs.get(segs.slice(0, -1)) : null;
      return [{ segs, node, parent, name: segs.length ? this.fs.key(parent, last) : '' }];
    }
  }

  function winPing(host, count) {
    const addr = fakeAddress(host);
    const local = addr.startsWith('127.');
    const rand = seeded(hashString(host) + 11);
    const times = [];
    let out = `\nPinging ${host === addr ? addr : `${host} [${addr}]`} with 32 bytes of data:\n`;
    for (let i = 0; i < count; i++) {
      const t = local ? 0 : Math.round(18 + rand() * 30);
      times.push(t);
      out += `Reply from ${addr}: bytes=32 time${local ? '<1' : '=' + t}ms TTL=${local ? 128 : 117}\n`;
    }
    out += `\nPing statistics for ${addr}:\n    Packets: Sent = ${count}, Received = ${count}, Lost = 0 (0% loss),\n`;
    out += `Approximate round trip times in milli-seconds:\n    Minimum = ${Math.min(...times)}ms, Maximum = ${Math.max(...times)}ms, Average = ${Math.round(times.reduce((a, b) => a + b, 0) / count)}ms\n`;
    if (!/^(\d{1,3}(\.\d{1,3}){3}|localhost)$/i.test(host)) out += '(simulated: no real network traffic is sent)\n';
    return out;
  }

  const WIN_COMMANDS = {
    help(args) {
      if (args.length) {
        const key = this.unquote(args[0]).toUpperCase();
        const page = WIN_HELP[key];
        if (!page) return fail(`This command is not supported by the help utility.  Try "${args[0]} /?".`);
        return ok(`${page[1]}\n\n${page[0]}\n${page[2] ? `\nLinux equivalent: ${page[2]}\n` : ''}`);
      }
      const names = Object.keys(WIN_HELP);
      return ok('For more information on a specific command, type HELP command-name\n' +
        names.map(n => `${n.padEnd(14)}${WIN_HELP[n][1].split('.')[0]}.`).join('\n') +
        '\n\nPipes (|), redirects (> and >>), && and %VARIABLES% work. Up/Down for history, Tab to complete.\n');
    },

    dir(args) {
      const { flags, operands } = this.switches(args);
      const target = operands[0] || '.';
      const segs = this.resolve(target);
      if (!segs) return fail('The system cannot find the drive specified.');
      let dirSegs = segs;
      let filter = null;
      let node = this.fs.get(segs);
      const last = segs[segs.length - 1];
      if (last && hasGlob(last)) { dirSegs = segs.slice(0, -1); filter = globToRegExp(last, true); node = this.fs.get(dirSegs); }
      if (node && node.type === 'file') { filter = globToRegExp(this.fs.key(this.fs.get(segs.slice(0, -1)), last), true); dirSegs = segs.slice(0, -1); node = this.fs.get(dirSegs); }
      if (!node) return fail('File Not Found');

      if (flags.has('S')) {
        const found = [];
        const walk = (n, path) => {
          this.fs.sortedNames(n).forEach(name => {
            const child = n.children[name];
            const full = `${path}\\${name}`.replace(/^C:\\\\/, 'C:\\');
            if (!filter || filter.test(name)) found.push(full);
            if (child.type === 'dir') walk(child, full);
          });
        };
        walk(node, this.absPath(dirSegs).replace(/\\$/, ''));
        if (!found.length) return fail('File Not Found');
        if (flags.has('B')) return ok(found.join('\n') + '\n');
        return ok(found.join('\n') + `\n     ${found.length} item(s) found\n`);
      }

      const names = this.fs.sortedNames(node).filter(n => !filter || filter.test(n));
      if (!names.length && filter) return fail('File Not Found');
      if (flags.has('B')) return ok(names.length ? names.join('\n') + '\n' : '');

      let out = ' Volume in drive C has no label.\n Volume Serial Number is 6C1E-2A7F\n\n';
      out += ` Directory of ${this.absPath(dirSegs)}\n\n`;
      const row = (d, size, name) => `${winDate(d)}  ${winTime(d)}${size === null ? '    <DIR>          ' : fmtNum(size).padStart(18) + ' '}${name}\n`;
      let files = 0;
      let dirs = 0;
      let bytes = 0;
      if (dirSegs.length && !filter) {
        out += row(node.mtime, null, '.') + row(node.mtime, null, '..');
        dirs += 2;
      }
      for (const n of names) {
        const child = node.children[n];
        if (child.type === 'dir') { dirs++; out += row(child.mtime, null, n); } else {
          files++;
          bytes += child.content.length;
          out += row(child.mtime, child.content.length, n);
        }
      }
      out += `${String(files).padStart(16)} File(s) ${fmtNum(bytes).padStart(14)} bytes\n`;
      out += `${String(dirs).padStart(16)} Dir(s)  48,213,422,080 bytes free\n`;
      return ok(out);
    },

    cd(args) {
      const { operands } = this.switches(args);
      if (!operands.length) return ok(this.absPath(this.cwd) + '\n');
      const target = operands.join(' ');
      const segs = this.resolve(target);
      if (!segs) return fail('The system cannot find the drive specified.');
      const node = this.fs.get(segs);
      if (!node) return fail('The system cannot find the path specified.');
      if (node.type !== 'dir') return fail('The directory name is invalid.');
      this.cwd = this.fs.canonical(segs);
      return ok();
    },

    chdir(args) { return WIN_COMMANDS.cd.call(this, args); },

    cls() { return { out: '', err: '', code: 0, clear: true }; },

    type(args, stdin) {
      if (!args.length) return fail('The syntax of the command is incorrect.');
      let out = '';
      const errors = [];
      const multiple = args.length > 1 || args.some(a => hasGlob(a));
      for (const a of args) {
        if (/^nul$/i.test(this.unquote(a))) continue; // TYPE NUL prints nothing
        const matches = this.matchPaths(a);
        if (!matches || !matches.length) { errors.push('The system cannot find the file specified.'); continue; }
        for (const m of matches) {
          if (m.node.type === 'dir') { errors.push('Access is denied.'); continue; }
          if (multiple) out += `\n${this.unquote(a).includes('*') ? m.name : this.unquote(a)}\n\n\n`;
          out += m.node.content;
        }
      }
      return { out, err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    more(args, stdin) {
      if (!args.length) return ok(stdin || '');
      return WIN_COMMANDS.type.call(this, args.slice(0, 1));
    },

    echo(args) {
      if (!args.length) return ok('ECHO is on.\n');
      if (args.length === 1 && /^(on|off)$/i.test(args[0])) return ok();
      return ok(args.join(' ') + '\n');
    },

    mkdir(args) {
      if (!args.length) return fail('The syntax of the command is incorrect.');
      const errors = [];
      for (const a of args) {
        const segs = this.resolve(a);
        if (!segs) { errors.push('The system cannot find the drive specified.'); continue; }
        if (this.fs.get(segs)) { errors.push(`A subdirectory or file ${this.unquote(a)} already exists.`); continue; }
        let node = this.fs.root;
        for (const seg of segs) {
          const k = this.fs.key(node, seg);
          if (k === null) {
            if (!this.canWrite(node)) { errors.push('Access is denied.'); break; }
            node.children[seg] = makeDir();
            node = node.children[seg];
          } else if (node.children[k].type !== 'dir') { errors.push('The system cannot find the path specified.'); break; } else node = node.children[k];
        }
      }
      return { out: '', err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    md(args) { return WIN_COMMANDS.mkdir.call(this, args); },

    rmdir(args) {
      const { flags, operands } = this.switches(args);
      if (!operands.length) return fail('The syntax of the command is incorrect.');
      const errors = [];
      let out = '';
      for (const a of operands) {
        const segs = this.resolve(a);
        const node = segs && this.fs.get(segs);
        if (!node || !segs.length) { errors.push(!segs || segs.length ? 'The system cannot find the file specified.' : 'The process cannot access the file because it is being used by another process.'); continue; }
        if (node.type !== 'dir') { errors.push('The directory name is invalid.'); continue; }
        const parent = this.fs.get(segs.slice(0, -1));
        if (!this.canWrite(parent) || !this.canWrite(node)) { errors.push('Access is denied.'); continue; }
        const cwdInside = this.absPath(this.cwd).toLowerCase() + '\\';
        if (cwdInside.startsWith(this.absPath(segs).toLowerCase() + '\\')) { errors.push('The process cannot access the file because it is being used by another process.'); continue; }
        if (Object.keys(node.children).length && !flags.has('S')) { errors.push('The directory is not empty.'); continue; }
        if (flags.has('S') && !flags.has('Q')) out += `${this.unquote(a)}, Are you sure (Y/N)? Y\n`;
        delete parent.children[this.fs.key(parent, segs[segs.length - 1])];
      }
      return { out, err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    rd(args) { return WIN_COMMANDS.rmdir.call(this, args); },

    del(args) {
      const { flags, operands } = this.switches(args);
      if (!operands.length) return fail('The syntax of the command is incorrect.');
      const errors = [];
      let out = '';
      for (const a of operands) {
        const matches = this.matchPaths(a);
        if (!matches || !matches.length) { errors.push(`Could Not Find ${this.absPath(this.resolve(a) || this.cwd)}`); continue; }
        for (const m of matches) {
          if (m.node.type === 'dir') {
            // DEL on a folder deletes the files inside it
            if (!flags.has('Q')) out += `${this.absPath(m.segs)}\\*, Are you sure (Y/N)? Y\n`;
            if (!this.canWrite(m.node)) { errors.push('Access is denied.'); continue; }
            Object.keys(m.node.children).forEach(k => { if (m.node.children[k].type === 'file') delete m.node.children[k]; });
            continue;
          }
          if (!this.canWrite(m.parent)) { errors.push(`Access is denied.`); continue; }
          delete m.parent.children[m.name];
        }
      }
      return { out, err: errors.join('\n'), code: errors.length ? 1 : 0 };
    },

    erase(args) { return WIN_COMMANDS.del.call(this, args); },

    copy(args) { return winCopyMove.call(this, args, 'copy'); },
    move(args) { return winCopyMove.call(this, args, 'move'); },

    ren(args) {
      const { operands } = this.switches(args);
      if (operands.length !== 2 || /[\\/]/.test(this.unquote(operands[1]))) return fail('The syntax of the command is incorrect.');
      const matches = this.matchPaths(operands[0]);
      if (!matches || !matches.length) return fail('The system cannot find the file specified.');
      const m = matches[0];
      const newName = this.unquote(operands[1]);
      if (!this.canWrite(m.parent)) return fail('Access is denied.');
      const clash = this.fs.key(m.parent, newName);
      if (clash !== null && clash !== m.name) return fail('A duplicate file name exists, or the file\ncannot be found.');
      const node = m.parent.children[m.name];
      delete m.parent.children[m.name];
      m.parent.children[newName] = node;
      return ok();
    },

    rename(args) { return WIN_COMMANDS.ren.call(this, args); },

    ver() { return ok('\nMicrosoft Windows [Version 10.0.22631.4317]\n'); },
    whoami() { return ok('portfolio\\guest\n'); },
    hostname() { return ok('PORTFOLIO\n'); },

    date(args) {
      const d = new Date();
      const today = `${DAYS[d.getDay()]} ${winDate(d)}`;
      return ok(args.some(a => /^\/t$/i.test(a)) ? `${today}\n` : `The current date is: ${today}\n`);
    },

    time(args) {
      const d = new Date();
      if (args.some(a => /^\/t$/i.test(a))) return ok(`${winTime(d)}\n`);
      return ok(`The current time is: ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad2(Math.floor(d.getMilliseconds() / 10))}\n`);
    },

    ipconfig(args) {
      const all = args.some(a => /^\/all$/i.test(a));
      let out = '\nWindows IP Configuration\n\n';
      if (all) {
        out += '   Host Name . . . . . . . . . . . . : PORTFOLIO\n   Primary Dns Suffix  . . . . . . . : \n   Node Type . . . . . . . . . . . . : Hybrid\n   IP Routing Enabled. . . . . . . . : No\n\n';
      }
      out += '\nEthernet adapter Ethernet:\n\n   Connection-specific DNS Suffix  . : \n';
      if (all) {
        out += '   Description . . . . . . . . . . . : Intel(R) Ethernet Connection I219-V\n   Physical Address. . . . . . . . . : 52-54-00-3A-9C-21\n   DHCP Enabled. . . . . . . . . . . : Yes\n';
      }
      out += '   IPv4 Address. . . . . . . . . . . : 192.168.1.42\n   Subnet Mask . . . . . . . . . . . : 255.255.255.0\n   Default Gateway . . . . . . . . . : 192.168.1.1\n';
      if (all) out += '   DHCP Server . . . . . . . . . . . : 192.168.1.1\n   DNS Servers . . . . . . . . . . . : 192.168.1.1\n';
      return ok(out);
    },

    ping(args) {
      const operands = [];
      let count = 4;
      for (let i = 0; i < args.length; i++) {
        if (/^[-/]n$/i.test(args[i])) { count = Math.min(Math.max(parseInt(args[++i], 10) || 4, 1), 10); continue; }
        if (/^[-/]t$/i.test(args[i])) continue;
        operands.push(this.unquote(args[i]));
      }
      if (!operands.length) return fail('\nUsage: ping [-n count] target_name\n');
      return ok(winPing(operands[0], count));
    },

    systeminfo() {
      return ok('\nHost Name:                 PORTFOLIO\nOS Name:                   Microsoft Windows 11 Pro (simulated)\nOS Version:                10.0.22631 N/A Build 22631\n' +
        'System Manufacturer:       Portfolio Labs\nSystem Type:               x64-based PC\nProcessor(s):              1 Processor(s) Installed.\n' +
        'Total Physical Memory:     8,192 MB\nAvailable Physical Memory: 5,410 MB\nDomain:                    WORKGROUP\nNetwork Card(s):           1 NIC(s) Installed.\n' +
        '                           [01]: Intel(R) Ethernet Connection I219-V\n                                 IP address(es)\n                                 [01]: 192.168.1.42\n');
    },

    tasklist() {
      let out = '\nImage Name                     PID Session Name        Session#    Mem Usage\n' +
        '========================= ======== ================ =========== ============\n';
      for (const p of this.processes) {
        out += `${p[0].padEnd(25)} ${String(p[1]).padStart(8)} ${p[2].padEnd(16)} ${String(p[2] === 'Console' ? 1 : 0).padStart(11)} ${p[3].padStart(12)}\n`;
      }
      out += `${'tasklist.exe'.padEnd(25)} ${String(8800 + this.history.length).padStart(8)} ${'Console'.padEnd(16)} ${'1'.padStart(11)} ${'9,876 K'.padStart(12)}\n`;
      return ok(out);
    },

    taskkill(args) {
      let pid = null;
      let image = null;
      for (let i = 0; i < args.length; i++) {
        if (/^\/pid$/i.test(args[i])) pid = Number(args[++i]);
        else if (/^\/im$/i.test(args[i])) image = this.unquote(args[++i] || '').toLowerCase();
      }
      if (pid === null && image === null) return fail('ERROR: Invalid syntax. Neither /FI nor /PID nor /IM were specified.\nType "TASKKILL /?" for usage.');
      const idx = this.processes.findIndex(p => (pid !== null ? p[1] === pid : p[0].toLowerCase() === image));
      if (idx < 0) return fail(`ERROR: The process "${pid !== null ? pid : image}" not found.`, 128);
      const p = this.processes[idx];
      if (p[2] === 'Services') return fail(`ERROR: The process with PID ${p[1]} could not be terminated.\nReason: Access is denied.`);
      this.processes.splice(idx, 1);
      return ok(`SUCCESS: The process "${p[0]}" with PID ${p[1]} has been terminated.\n`);
    },

    set(args) {
      const text = args.join(' ');
      if (!text) return ok(Object.keys(this.env).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map(k => `${k}=${this.env[k]}`).join('\n') + '\n');
      const m = /^"?([^=]+)=(.*?)"?$/.exec(text);
      if (m) {
        const existing = Object.keys(this.env).find(k => k.toLowerCase() === m[1].toLowerCase());
        if (m[2] === '') { if (existing) delete this.env[existing]; return ok(); }
        this.env[existing || m[1]] = m[2];
        return ok();
      }
      const matches = Object.keys(this.env).filter(k => k.toLowerCase().startsWith(text.toLowerCase()));
      if (!matches.length) return fail(`Environment variable ${text} not defined`);
      return ok(matches.map(k => `${k}=${this.env[k]}`).join('\n') + '\n');
    },

    tree(args) {
      const { flags, operands } = this.switches(args);
      const segs = this.resolve(operands[0] || '.');
      const node = segs && this.fs.get(segs);
      if (!node || node.type !== 'dir') return fail(`Invalid path - ${this.unquote(operands[0] || '.').toUpperCase()}\nNo subfolders exist`);
      let out = `Folder PATH listing\nVolume serial number is 6C1E-2A7F\n${this.absPath(segs).toUpperCase()}\n`;
      let any = false;
      const walk = (n, prefix) => {
        const names = this.fs.sortedNames(n);
        const dirs = names.filter(x => n.children[x].type === 'dir');
        if (flags.has('F')) {
          names.filter(x => n.children[x].type === 'file').forEach(f => { out += `${prefix}${dirs.length ? '│   ' : '    '}${f}\n`; any = true; });
          if (names.some(x => n.children[x].type === 'file')) out += `${prefix}${dirs.length ? '│' : ''}\n`;
        }
        dirs.forEach((d, i) => {
          const last = i === dirs.length - 1;
          out += `${prefix}${last ? '└───' : '├───'}${d}\n`;
          any = true;
          walk(n.children[d], prefix + (last ? '    ' : '│   '));
        });
      };
      walk(node, '');
      if (!any) out += 'No subfolders exist\n';
      return ok(out);
    },

    find(args, stdin) {
      const { flags, operands } = this.switches(args);
      if (!operands.length || !/^".*"$/.test(operands[0])) return fail('FIND: Parameter format not correct');
      const needle = this.unquote(operands[0]);
      const test = line => (flags.has('I') ? line.toLowerCase().includes(needle.toLowerCase()) : line.includes(needle)) !== flags.has('V');
      const files = operands.slice(1);
      let out = '';
      let total = 0;
      const scan = (text, label) => {
        const matched = [];
        lines(text).forEach((l, i) => { if (test(l)) matched.push(flags.has('N') ? `[${i + 1}]${l}` : l); });
        total += matched.length;
        if (label !== null) out += flags.has('C') ? `\n---------- ${label}: ${matched.length}\n` : `\n---------- ${label}\n${matched.map(x => x + '\n').join('')}`;
        else out += flags.has('C') ? `${matched.length}\n` : matched.map(x => x + '\n').join('');
      };
      if (!files.length) scan(stdin || '', null);
      for (const f of files) {
        const matches = this.matchPaths(f);
        if (!matches || !matches.length) return fail(`File not found - ${this.unquote(f).toUpperCase()}`);
        matches.filter(m => m.node.type === 'file').forEach(m => scan(m.node.content, m.name.toUpperCase()));
      }
      return { out, err: '', code: total ? 0 : 1 };
    },

    findstr(args, stdin) {
      const { flags, operands } = this.switches(args);
      if (!operands.length) return fail('FINDSTR: Bad command line', 2);
      const needles = this.unquote(operands[0]).split(' ').filter(Boolean);
      const ci = flags.has('I');
      const test = line => needles.some(n => (ci ? line.toLowerCase().includes(n.toLowerCase()) : line.includes(n))) !== flags.has('V');
      const files = [];
      for (const f of operands.slice(1)) {
        const matches = this.matchPaths(f);
        if (!matches || !matches.length) return fail(`FINDSTR: Cannot open ${this.unquote(f)}`, 2);
        matches.filter(m => m.node.type === 'file').forEach(m => files.push({ name: f.includes('*') ? m.name : this.unquote(f), text: m.node.content }));
      }
      const sources = files.length ? files : [{ name: null, text: stdin || '' }];
      let out = '';
      for (const s of sources) {
        lines(s.text).forEach((l, i) => {
          if (test(l)) out += `${files.length > 1 ? s.name + ':' : ''}${flags.has('N') ? i + 1 + ':' : ''}${l}\n`;
        });
      }
      return { out, err: '', code: out ? 0 : 1 };
    },

    sort(args, stdin) {
      const { flags, operands } = this.switches(args);
      let text = stdin || '';
      if (operands.length) {
        const node = this.fs.get(this.resolve(operands[0]) || []);
        if (!node || node.type !== 'file') return fail('The system cannot find the file specified.');
        text = node.content;
      }
      const all = lines(text).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      if (flags.has('R')) all.reverse();
      return ok(all.length ? all.join('\n') + '\n' : '');
    },

    where(args) {
      const builtins = ['dir', 'cd', 'chdir', 'cls', 'copy', 'del', 'erase', 'echo', 'md', 'mkdir', 'move', 'rd', 'rmdir', 'ren', 'rename', 'set', 'type', 'ver', 'date', 'time', 'help'];
      const found = [];
      for (const a of args) {
        const n = this.unquote(a).toLowerCase().replace(/\.exe$/, '');
        if (WIN_COMMANDS[n] && !builtins.includes(n)) found.push(`C:\\Windows\\System32\\${n}.exe`);
      }
      if (!found.length) return fail('INFO: Could not find files for the given pattern(s).');
      return ok(found.join('\n') + '\n');
    },

    doskey(args) {
      if (args.some(a => /^\/history$/i.test(a))) return ok(this.history.join('\n') + '\n');
      return ok();
    },

    notepad() { return fail('Notepad can\'t open in this simulator. Use TYPE to read files and ECHO text > file to write them.'); },
    runas() { return fail('RUNAS ERROR: Unable to run - administrator accounts are not available in this simulator.'); },
    powershell() { return fail('PowerShell isn\'t available here. Switch to the Linux tab for a bash shell, or keep using CMD commands.'); },

    exit() {
      return ok('(This is a simulated command prompt, so there is nothing to close. Type HELP to keep exploring.)\n');
    }
  };

  function winCopyMove(args, cmd) {
    const { operands } = this.switches(args);
    if (!operands.length) return fail('The syntax of the command is incorrect.');
    const matches = this.matchPaths(operands[0]);
    if (!matches || !matches.length) return fail('The system cannot find the file specified.');
    const destPath = operands[1] || '.';
    const destSegs = this.resolve(destPath);
    if (!destSegs) return fail('The system cannot find the drive specified.');
    const destNode = this.fs.get(destSegs);
    const sources = matches.filter(m => cmd === 'move' || m.node.type === 'file');
    if (!sources.length) return fail('The system cannot find the file specified.');
    if (sources.length > 1 && (!destNode || destNode.type !== 'dir')) return fail('The syntax of the command is incorrect.');
    let done = 0;
    for (const m of sources) {
      let parent;
      let name;
      if (destNode && destNode.type === 'dir') { parent = destNode; name = m.name; } else {
        parent = this.fs.get(destSegs.slice(0, -1));
        name = destSegs[destSegs.length - 1];
      }
      if (!parent || parent.type !== 'dir') return fail('The system cannot find the path specified.');
      if (!this.canWrite(parent) || (cmd === 'move' && !this.canWrite(m.parent))) return fail('Access is denied.');
      if (parent === m.parent && this.fs.key(parent, name) === m.name) {
        if (cmd === 'copy') return fail('The file cannot be copied onto itself.\n        0 file(s) copied.');
        continue;
      }
      const existingKey = this.fs.key(parent, name);
      if (existingKey !== null) delete parent.children[existingKey];
      parent.children[existingKey || name] = cmd === 'copy' ? clone(m.node) : m.node;
      if (cmd === 'move') delete m.parent.children[m.name];
      done++;
    }
    return ok(`        ${done} file(s) ${cmd === 'copy' ? 'copied' : 'moved'}.\n`);
  }

  // ==========================================================================
  // Export for tests, or wire up the page
  // ==========================================================================

  const api = { LinuxShell, WindowsShell, tokenize, parse };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  // ----- UI -----

  const shells = { linux: new LinuxShell(), windows: new WindowsShell() };
  const views = {};
  let active = 'linux';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function promptNodes(shell) {
    const p = shell.prompt();
    const frag = document.createDocumentFragment();
    if (p.user) {
      frag.appendChild(el('span', 'p-user', p.user));
      frag.appendChild(document.createTextNode(':'));
    }
    frag.appendChild(el('span', 'p-path', p.path));
    frag.appendChild(document.createTextNode(p.symbol + ' '));
    return frag;
  }

  function setupView(name) {
    const shell = shells[name];
    const pane = document.getElementById(`term-${name}`);
    const output = pane.querySelector('.term-output');
    const form = pane.querySelector('form');
    const input = pane.querySelector('input');
    const promptEl = pane.querySelector('.term-prompt');
    const titleEl = document.querySelector(`[data-title="${name}"]`);
    let historyIndex = null;
    let draft = '';

    const view = { shell, pane, output, input };
    views[name] = view;

    function renderPrompt() {
      promptEl.textContent = '';
      promptEl.appendChild(promptNodes(shell));
      if (titleEl) titleEl.textContent = name === 'linux' ? `guest@portfolio: ${shell.prompt().path}` : `Command Prompt — ${shell.prompt().path}`;
    }

    function print(text, cls) {
      if (!text) return;
      const block = el('div', cls ? `term-line ${cls}` : 'term-line', text.replace(/\n$/, ''));
      output.appendChild(block);
    }

    function scrollToEnd() {
      const body = pane.querySelector('.term-body');
      body.scrollTop = body.scrollHeight;
    }

    view.runCommand = function (line) {
      const echo = el('div', 'term-line term-echo');
      echo.appendChild(promptNodes(shell));
      echo.appendChild(document.createTextNode(line));
      output.appendChild(echo);
      const result = shell.run(line);
      if (result.clear) output.textContent = '';
      print(result.out);
      print(result.err, 'term-err');
      renderPrompt();
      historyIndex = null;
      scrollToEnd();
    };

    print(shell.banner(), 'term-banner');
    renderPrompt();

    form.addEventListener('submit', event => {
      event.preventDefault();
      const line = input.value;
      input.value = '';
      view.runCommand(line);
    });

    input.addEventListener('keydown', event => {
      const hist = shell.history;
      if (event.key === 'ArrowUp') {
        if (!hist.length) return;
        event.preventDefault();
        if (historyIndex === null) { draft = input.value; historyIndex = hist.length; }
        historyIndex = Math.max(0, historyIndex - 1);
        input.value = hist[historyIndex];
      } else if (event.key === 'ArrowDown') {
        if (historyIndex === null) return;
        event.preventDefault();
        historyIndex++;
        if (historyIndex >= hist.length) { historyIndex = null; input.value = draft; } else input.value = hist[historyIndex];
      } else if (event.key === 'Tab') {
        event.preventDefault();
        const result = shell.complete(input.value);
        input.value = result.text;
        if (result.options.length) {
          const echo = el('div', 'term-line term-echo');
          echo.appendChild(promptNodes(shell));
          echo.appendChild(document.createTextNode(input.value));
          output.appendChild(echo);
          print(result.options.join('  '));
          scrollToEnd();
        }
      } else if (event.key === 'l' && event.ctrlKey) {
        event.preventDefault();
        output.textContent = '';
      } else if (event.key === 'c' && event.ctrlKey && !window.getSelection().toString()) {
        event.preventDefault();
        const echo = el('div', 'term-line term-echo');
        echo.appendChild(promptNodes(shell));
        echo.appendChild(document.createTextNode(input.value + '^C'));
        output.appendChild(echo);
        input.value = '';
        historyIndex = null;
        scrollToEnd();
      }
    });

    pane.querySelector('.term-body').addEventListener('click', () => {
      if (!window.getSelection().toString()) input.focus({ preventScroll: true });
    });
  }

  function activate(name, focus, remember = true) {
    active = name;
    document.querySelectorAll('[role="tab"]').forEach(tab => {
      const selected = tab.dataset.os === name;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('.term-pane').forEach(p => { p.hidden = p.id !== `term-${name}`; });
    document.querySelectorAll('[data-chips]').forEach(c => { c.hidden = c.dataset.chips !== name; });
    if (focus) views[name].input.focus({ preventScroll: true });
    if (remember) {
      try { history.replaceState(null, '', `#${name}`); } catch (e) { /* ignore */ }
    }
  }

  setupView('linux');
  setupView('windows');

  const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activate(tab.dataset.os, true));
    tab.addEventListener('keydown', event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      activate(next.dataset.os, false);
    });
  });

  document.querySelectorAll('[data-run]').forEach(chip => {
    chip.addEventListener('click', () => {
      const view = views[active];
      view.runCommand(chip.dataset.run);
      view.input.focus({ preventScroll: true });
    });
  });

  document.querySelectorAll('[data-try]').forEach(cell => {
    cell.addEventListener('click', () => {
      activate(cell.dataset.os, false);
      views[cell.dataset.os].runCommand(cell.dataset.try);
      document.getElementById('terminal-top').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  activate(location.hash === '#windows' ? 'windows' : 'linux', false, false);
})();
