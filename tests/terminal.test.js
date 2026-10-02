// Run with: node tests/terminal.test.js
const assert = require('assert');
const { LinuxShell, WindowsShell } = require('../js/terminal.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL: ${name}\n${e.message}`);
    process.exitCode = 1;
  }
}

const out = (shell, cmd) => shell.run(cmd).out;
const err = (shell, cmd) => shell.run(cmd).err;

// ----- Linux -----

test('linux: navigation', () => {
  const sh = new LinuxShell();
  assert.strictEqual(out(sh, 'pwd'), '/home/guest\n');
  sh.run('cd projects');
  assert.strictEqual(out(sh, 'pwd'), '/home/guest/projects\n');
  assert.strictEqual(sh.prompt().path, '~/projects');
  sh.run('cd ..');
  sh.run('cd /etc');
  assert.strictEqual(sh.prompt().path, '/etc');
  assert.strictEqual(out(sh, 'cd -'), '/home/guest\n');
  sh.run('cd');
  assert.strictEqual(sh.prompt().path, '~');
  assert.match(err(sh, 'cd nope'), /No such file or directory/);
  assert.match(err(sh, 'cd about.txt'), /Not a directory/);
});

test('linux: ls, hidden files and globs', () => {
  const sh = new LinuxShell();
  assert.strictEqual(out(sh, 'ls'), 'about.txt  contact.txt  notes  projects  skills.txt\n');
  assert.ok(out(sh, 'ls -a').includes('.bashrc'));
  assert.ok(!out(sh, 'ls').includes('.bashrc'));
  assert.match(out(sh, 'ls -l about.txt'), /^-rw-r--r-- 1 guest guest +\d+ Oct  1 09:30 about\.txt\n$/);
  assert.strictEqual(out(sh, 'ls projects/s*.md'), 'projects/safeclick.md\n');
});

test('linux: files, redirects and pipes', () => {
  const sh = new LinuxShell();
  sh.run('echo hello > a.txt');
  sh.run('echo world >> a.txt');
  assert.strictEqual(out(sh, 'cat a.txt'), 'hello\nworld\n');
  assert.strictEqual(out(sh, 'cat a.txt | wc -l'), '2\n');
  assert.strictEqual(out(sh, 'cat /var/log/auth.log | grep Failed | wc -l'), '3\n');
  assert.strictEqual(out(sh, 'grep -c -i failed /var/log/auth.log'), '3\n');
  assert.strictEqual(out(sh, 'cat skills.txt | sort | head -n 2'), 'Bash\nBurp Suite\n');
  sh.run('mkdir -p x/y/z');
  sh.run('touch x/y/z/f.txt');
  assert.strictEqual(out(sh, 'find x -name "*.txt"'), 'x/y/z/f.txt\n');
  sh.run('cp -r x x2');
  sh.run('mv x2 x3');
  assert.strictEqual(out(sh, 'ls x3/y/z'), 'f.txt\n');
  assert.match(err(sh, 'rm x'), /Is a directory/);
  sh.run('rm -r x x3');
  assert.ok(!out(sh, 'ls').trim().split(/\s+/).includes('x'));
  assert.strictEqual(out(sh, 'echo hi > /dev/null'), '');
});

test('linux: variables, && and exit codes', () => {
  const sh = new LinuxShell();
  sh.run('export NAME=Ayush');
  assert.strictEqual(out(sh, 'echo "Hi $NAME" \'$NAME\''), 'Hi Ayush $NAME\n');
  assert.strictEqual(out(sh, 'whoami && hostname'), 'guest\nportfolio\n');
  assert.strictEqual(out(sh, 'ls nope && echo never'), '');
  sh.run('grep zzz skills.txt');
  assert.strictEqual(out(sh, 'echo $?'), '1\n');
});

test('linux: permissions', () => {
  const sh = new LinuxShell();
  assert.match(err(sh, 'echo x > /etc/hosts'), /Permission denied/);
  assert.match(err(sh, 'cat /etc/shadow'), /Permission denied/);
  assert.match(err(sh, 'touch /etc/new'), /Permission denied/);
  assert.match(err(sh, 'sudo ls'), /not in the sudoers file/);
  assert.match(err(sh, 'rm -rf /'), /dangerous to operate recursively/);
  assert.strictEqual(err(sh, 'touch /tmp/ok.txt'), '');
  sh.run('chmod 600 about.txt');
  assert.match(out(sh, 'ls -l about.txt'), /^-rw------- /);
  sh.run('chmod +x about.txt');
  assert.match(out(sh, 'ls -l about.txt'), /^-rwx--x--x /);
});

test('linux: Windows commands get a hint', () => {
  const sh = new LinuxShell();
  assert.match(err(sh, 'dir'), /dir: command not found\nHint: on Linux, use "ls"/);
  assert.match(err(sh, 'ipconfig'), /use "ip a"/);
});

test('linux: syntax errors', () => {
  const sh = new LinuxShell();
  assert.match(err(sh, 'echo "open'), /matching quote/);
  assert.match(err(sh, 'ls |'), /syntax error/);
  assert.match(err(sh, 'echo >'), /syntax error/);
});

test('linux: tab completion', () => {
  const sh = new LinuxShell();
  assert.strictEqual(sh.complete('ca').text, 'cat ');
  assert.strictEqual(sh.complete('cat ab').text, 'cat about.txt ');
  assert.strictEqual(sh.complete('cd pro').text, 'cd projects/');
  assert.deepStrictEqual(sh.complete('c').options.slice(0, 2), ['cat', 'cd']);
});

// ----- Windows -----

test('windows: navigation (case-insensitive)', () => {
  const sh = new WindowsShell();
  assert.strictEqual(out(sh, 'cd'), 'C:\\Users\\guest\n');
  sh.run('cd documents');
  assert.strictEqual(sh.prompt().path, 'C:\\Users\\guest\\Documents');
  sh.run('cd..');
  sh.run('cd \\');
  assert.strictEqual(sh.prompt().path, 'C:\\');
  sh.run('cd "C:\\Program Files"');
  assert.strictEqual(sh.prompt().path, 'C:\\Program Files');
  assert.match(err(sh, 'cd D:\\'), /cannot find the drive/);
  assert.match(err(sh, 'cd nowhere'), /cannot find the path/);
});

test('windows: dir formats', () => {
  const sh = new WindowsShell();
  const listing = out(sh, 'dir');
  assert.ok(listing.includes(' Directory of C:\\Users\\guest'));
  assert.ok(listing.includes('<DIR>          Documents'));
  assert.strictEqual(out(sh, 'dir /b'), 'Desktop\nDocuments\nDownloads\n');
  assert.strictEqual(out(sh, 'dir Documents\\Projects\\S*.txt /b'), 'SafeClick.txt\n');
  assert.ok(out(sh, 'dir /s /b *.txt').includes('C:\\Users\\guest\\Documents\\Projects\\CyberLens.txt'));
});

test('windows: files, redirects and pipes', () => {
  const sh = new WindowsShell();
  sh.run('echo hello > note.txt');
  sh.run('echo second >> note.txt');
  assert.strictEqual(out(sh, 'type note.txt'), 'hello\nsecond\n');
  assert.strictEqual(out(sh, 'copy note.txt Downloads'), '        1 file(s) copied.\n');
  sh.run('ren note.txt renamed.txt');
  assert.ok(out(sh, 'dir /b').includes('renamed.txt'));
  sh.run('del renamed.txt');
  assert.match(err(sh, 'del renamed.txt'), /Could Not Find/);
  sh.run('mkdir Work\\Reports');
  assert.match(err(sh, 'rd Work'), /not empty/);
  sh.run('rd /s /q Work');
  assert.ok(!out(sh, 'dir /b').includes('Work'));
  sh.run('type nul > empty.txt');
  assert.strictEqual(out(sh, 'type empty.txt'), '');
  assert.strictEqual(out(sh, 'tasklist | find "notepad"').trim().split(/\s+/)[0], 'notepad.exe');
  assert.strictEqual(out(sh, 'findstr /i /n gurans Documents\\about.txt'), '2:IT Technician @ Gurans Herbaceuticals (Biratnagar, Nepal)\n');
});

test('windows: variables, processes and permissions', () => {
  const sh = new WindowsShell();
  sh.run('set MYVAR=hello');
  assert.strictEqual(out(sh, 'echo %MYVAR% from %USERNAME%'), 'hello from guest\n');
  assert.match(out(sh, 'taskkill /im notepad.exe'), /SUCCESS/);
  assert.match(err(sh, 'taskkill /pid 4'), /Access is denied/);
  assert.match(err(sh, 'mkdir C:\\Windows\\test'), /Access is denied/);
  assert.match(err(sh, 'echo x > C:\\Windows\\x.txt'), /Access is denied/);
});

test('windows: help and Linux hints', () => {
  const sh = new WindowsShell();
  assert.ok(out(sh, 'help').includes('FINDSTR'));
  assert.strictEqual(out(sh, 'dir /?'), out(sh, 'help dir'));
  assert.match(err(sh, 'ls'), /'ls' is not recognized[\s\S]*use "dir"/);
  assert.match(err(sh, 'grep x'), /use "findstr"/);
});

test('windows: tab completion', () => {
  const sh = new WindowsShell();
  assert.strictEqual(sh.complete('ty').text, 'type ');
  assert.strictEqual(sh.complete('cd doc').text, 'cd Documents\\');
  assert.strictEqual(sh.complete('type Documents\\a').text, 'type Documents\\about.txt ');
});

console.log(`${passed} terminal tests passed.`);
