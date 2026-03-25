document.addEventListener('DOMContentLoaded', () => {

  // 0. System Boot Preloader
  const preloader = document.getElementById('preloader');
  const bootText = document.getElementById('boot-text');
  if (preloader && bootText) {
    const bootSequence = [
      "INITIALIZING SYSTEM KERNEL...",
      "LOADING NEURAL INTERFACE...",
      "DECRYPTING SECURE DATA...",
      "BYPASSING FIREWALL [OK]",
      "ESTABLISHING SECURE CONNECTION...",
      "ACCESS GRANTED."
    ];
    let seqIdx = 0;
    
    function typeBootSequence() {
      if (seqIdx < bootSequence.length) {
        bootText.innerHTML += bootSequence[seqIdx] + "<br/>";
        seqIdx++;
        setTimeout(typeBootSequence, 150 + Math.random() * 200);
      } else {
        setTimeout(() => {
          preloader.classList.add('fade-out');
          setTimeout(() => preloader.remove(), 1000);
        }, 400);
      }
    }
    setTimeout(typeBootSequence, 200);
  }

  // 0.5 GitHub Live Stats Integration
  const repos = document.querySelectorAll('.project-card[data-repo]');
  repos.forEach(card => {
    const repoPath = card.getAttribute('data-repo');
    if (repoPath) {
      fetch(`https://api.github.com/repos/${repoPath}`)
        .then(res => res.json())
        .then(data => {
          if (data.stargazers_count !== undefined) {
            const statsContainer = document.createElement('div');
            statsContainer.className = 'github-stats';
            statsContainer.innerHTML = `
              <div class="stat-item" title="Stars">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                ${data.stargazers_count}
              </div>
              <div class="stat-item" title="Forks">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v12"></path><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>
                ${data.forks_count}
              </div>
            `;
            const projectContent = card.querySelector('.project-content');
            const link = projectContent.querySelector('.project-link');
            if (link) {
              projectContent.insertBefore(statsContainer, link);
            }
          }
        })
        .catch(err => console.error('GitHub fetch err:', err));
    }
  });

  // 0.6 Reading Scroll Progress
  const scrollProgress = document.getElementById('scroll-progress');
  if (scrollProgress) {
    window.addEventListener('scroll', () => {
      const totalScroll = document.documentElement.scrollTop;
      const windowHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scroll = `${totalScroll / windowHeight * 100}%`;
      scrollProgress.style.width = scroll;
    });
  }

  // 0.7 Konami Code Easter Egg
  const konamiCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let konamiIndex = 0;

  document.addEventListener('keydown', (e) => {
    if (e.key === konamiCode[konamiIndex]) {
      konamiIndex++;
      if (konamiIndex === konamiCode.length) {
        // Konami Code successfully entered!
        if (typeof confetti === 'function') {
          const duration = 3000;
          const end = Date.now() + duration;

          (function frame() {
            confetti({
              particleCount: 5,
              angle: 60,
              spread: 55,
              origin: { x: 0 },
              colors: ['#3b82f6', '#ec4899', '#8b5cf6']
            });
            confetti({
              particleCount: 5,
              angle: 120,
              spread: 55,
              origin: { x: 1 },
              colors: ['#3b82f6', '#ec4899', '#8b5cf6']
            });

            if (Date.now() < end) {
              requestAnimationFrame(frame);
            }
          }());
        }
        
        // Also flash the background quickly like an arcade win
        const oldTheme = document.documentElement.getAttribute('data-theme');
        document.documentElement.setAttribute('data-theme', 'light');
        setTimeout(() => document.documentElement.setAttribute('data-theme', 'dark'), 150);
        setTimeout(() => document.documentElement.setAttribute('data-theme', 'light'), 300);
        setTimeout(() => document.documentElement.setAttribute('data-theme', oldTheme || 'dark'), 450);

        konamiIndex = 0; // Reset
      }
    } else {
      konamiIndex = 0; // Reset if interrupted
      // Also catch if the user started halfway through (e.g., arrow up twice again)
      if (e.key === 'ArrowUp') {
        konamiIndex = 1;
      }
    }
  });

  // 0.8 Skills Radar Chart
  const skillsCanvas = document.getElementById('skillsRadarChart');
  if (skillsCanvas && typeof Chart !== 'undefined') {
    const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
    
    const getChartColors = () => {
      const darkColor = 'rgba(248, 250, 252, 0.8)'; // text-primary dark
      const lightColor = 'rgba(2, 6, 23, 0.8)';   // text-primary light
      const gridColor = isDark() ? 'rgba(248, 250, 252, 0.1)' : 'rgba(2, 6, 23, 0.1)';
      const textColor = isDark() ? darkColor : lightColor;
      
      return { textColor, gridColor };
    };

    let colors = getChartColors();

    const data = {
      labels: ['Python', 'JavaScript', 'Security', 'Research', 'Full-Stack', 'Linux', 'Networking'],
      datasets: [{
        label: 'Proficiency Level',
        data: [95, 90, 85, 80, 92, 88, 75],
        fill: true,
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderColor: '#3b82f6',
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#3b82f6'
      }]
    };

    const config = {
      type: 'radar',
      data: data,
      options: {
        elements: {
          line: { borderWidth: 3 }
        },
        scales: {
          r: {
            angleLines: { color: colors.gridColor },
            grid: { color: colors.gridColor },
            pointLabels: {
              color: colors.textColor,
              font: { size: 14, family: 'Outfit' }
            },
            ticks: { display: false, stepSize: 20 },
            suggestedMin: 0,
            suggestedMax: 100
          }
        },
        plugins: {
          legend: { display: false }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    };

    const skillsChart = new Chart(skillsCanvas, config);

    // Watch for theme changes to update chart colors
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-theme') {
          const newColors = getChartColors();
          skillsChart.options.scales.r.angleLines.color = newColors.gridColor;
          skillsChart.options.scales.r.grid.color = newColors.gridColor;
          skillsChart.options.scales.r.pointLabels.color = newColors.textColor;
          skillsChart.update();
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
  }

  // 1. Initialize AOS (Animate On Scroll)
  if (typeof AOS !== 'undefined') {
    AOS.init({
      duration: 800,
      easing: 'ease-in-out',
      once: true,
      offset: 50,
    });
  }

  // 1.1 Initialize VanillaTilt for 3D physics on cards
  if (typeof VanillaTilt !== 'undefined') {
    VanillaTilt.init(document.querySelectorAll('.glass-card'), {
      max: 10,
      speed: 400,
      glare: true,
      "max-glare": 0.15,
      scale: 1.02
    });
  }

  // 1.5 Typing Animation Effect
  function createTypingEffect() {
    const subtitle = document.querySelector('.hero-subtitle');
    if (!subtitle) return;
    
    const text = subtitle.textContent.trim();
    subtitle.innerHTML = `<span class="typing-text">${text}</span>`;
  }
  
  createTypingEffect();

  // 1.7 Particle Click Effect
  function createParticle(x, y) {
    const particle = document.createElement('div');
    const size = Math.random() * 30 + 10;
    const duration = Math.random() * 0.5 + 0.5;
    
    particle.classList.add('particle');
    particle.style.left = x + 'px';
    particle.style.top = y + 'px';
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';
    particle.style.background = 'rgba(14, 165, 233, ' + Math.random() * 0.5 + ')';
    particle.style.animation = `slide-up ${duration}s ease-out forwards`;
    
    document.body.appendChild(particle);
    
    setTimeout(() => particle.remove(), duration * 1000);
  }
  
  document.addEventListener('click', (e) => {
    if (e.target.closest('.cta-btn') || e.target.closest('.project-card')) {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          createParticle(e.clientX + (Math.random() - 0.5) * 50, e.clientY + (Math.random() - 0.5) * 50);
        }, i * 30);
      }
    }
  });

  // 1.8 Custom Cursor Logic
  const cursorDot = document.querySelector('.cursor-dot');
  const cursorOutline = document.querySelector('.cursor-outline');
  
  if (cursorDot && cursorOutline) {
    window.addEventListener('mousemove', (e) => {
      const posX = e.clientX;
      const posY = e.clientY;
      
      cursorDot.style.left = `${posX}px`;
      cursorDot.style.top = `${posY}px`;
      cursorOutline.style.left = `${posX}px`;
      cursorOutline.style.top = `${posY}px`;
    });
    
    // Add hover effects for clickable items
    document.querySelectorAll('a, button, .project-card, input, textarea').forEach(el => {
      el.addEventListener('mouseenter', () => {
        cursorOutline.style.transform = 'translate(-50%, -50%) scale(1.5)';
        cursorOutline.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
      });
      el.addEventListener('mouseleave', () => {
        cursorOutline.style.transform = 'translate(-50%, -50%) scale(1)';
        cursorOutline.style.backgroundColor = 'transparent';
      });
    });
  }

  // 1.9 Spotlight Hover Effect for Glass Cards
  const glassCards = document.querySelectorAll('.glass-card');
  glassCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--spotlight-x', `${x}px`);
      card.style.setProperty('--spotlight-y', `${y}px`);
    });
  });

  // 2. Theme Toggle Logic
  const themeToggle = document.querySelector('.theme-toggle');
  const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');

  // Set initial theme based on localStorage or system preference
  const currentTheme = localStorage.getItem('theme');
  if (currentTheme == 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else if (currentTheme == 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    // Default to dark for this tech-focused portfolio
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  themeToggle.addEventListener('click', () => {
    let theme = document.documentElement.getAttribute('data-theme');

    // If not set explicitly, default to opposite of system pref, but here we enforce strings
    if (!theme) {
      theme = prefersDarkScheme.matches ? 'dark' : 'light';
    }

    const newTheme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  });

  // 3. Mobile Navigation Toggle
  const navToggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  const navItems = document.querySelectorAll('.nav-link');

  if (navToggle) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      navToggle.classList.toggle('open');
      const isExpanded = navToggle.getAttribute('aria-expanded') === 'true';
      navToggle.setAttribute('aria-expanded', !isExpanded);
    });
  }

  // Close mobile menu when clicking a link
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      if (navLinks.classList.contains('open')) {
        navLinks.classList.remove('open');
        navToggle.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  });

  // 4. Header Scroll Effect & Active Link Highlighting
  const header = document.querySelector('header');
  const sections = document.querySelectorAll('section[id]');

  const handleScroll = () => {
    // Add glass effect to header on scroll
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }

    // Active linking
    let scrollY = window.scrollY;
    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop - 150; // Offset for fixed header
      const sectionId = current.getAttribute('id');
      const activeLink = document.querySelector(`.nav-link[href*="${sectionId}"]`);

      if (activeLink && scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
        navItems.forEach(item => item.classList.remove('active'));
        activeLink.classList.add('active');
      }
    });
  };

  window.addEventListener('scroll', handleScroll);
  handleScroll(); // Call once on load

  // 5. Scroll to Top Button
  const scrollTopBtn = document.querySelector('.scroll-top');

  if (scrollTopBtn) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 500) {
        scrollTopBtn.classList.add('visible');
      } else {
        scrollTopBtn.classList.remove('visible');
      }
    });

    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // 6. Skill Progress Bar Animation via Intersection Observer
  const progressBars = document.querySelectorAll('.progress');

  if ('IntersectionObserver' in window && progressBars.length > 0) {
    const progressObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const bar = entry.target;
          const width = bar.getAttribute('data-width');
          bar.style.width = width;
          observer.unobserve(bar);
        }
      });
    }, { threshold: 0.1 });

    progressBars.forEach(bar => {
      progressObserver.observe(bar);
    });
  } else {
    // Fallback for older browsers
    progressBars.forEach(bar => {
      const width = bar.getAttribute('data-width');
      bar.style.width = width;
    });
  }

  // 7. Project Filtering Logic
  const filterBtns = document.querySelectorAll('.filter-btn');
  const projectCards = document.querySelectorAll('.project-card');

  if (filterBtns.length > 0) {
    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // Remove active class from all buttons
        filterBtns.forEach(b => b.classList.remove('active'));
        // Add active class to clicked button
        btn.classList.add('active');

        const filterValue = btn.getAttribute('data-filter');

        projectCards.forEach(card => {
          if (filterValue === 'all' || card.getAttribute('data-category') === filterValue) {
            // Unhide with animation (simply remove hidden, AOS or CSS will handle appearance)
            card.classList.remove('hidden');
          } else {
            // Hide non-matching projects
            card.classList.add('hidden');
          }
        });
      });
    });
  }

  // 7.5 Add Floating Class to Project Cards
  document.querySelectorAll('.project-card').forEach((card, index) => {
    card.style.animation = `float ${6 + index * 0.5}s ease-in-out infinite`;
  });

  // 7.6 Skill Progress Animation Enhancement
  const skillItems = document.querySelectorAll('.skill-item');
  skillItems.forEach((item) => {
    item.addEventListener('mouseenter', () => {
      const progress = item.querySelector('.progress');
      if (progress) {
        progress.style.animation = 'glow-pulse 2s ease-in-out 1';
      }
    });
  });

  // Helper for visible debugging
  function dLog(msg) {
    const d = document.getElementById('debug-log');
    if(d) d.innerHTML += msg + '<br>';
    console.log(msg);
  }

  // 8. Interactive Terminal Logic
  const terminalInput = document.getElementById('terminal-input');
  const terminalBody = document.getElementById('terminal-body');

  dLog('Found terminalInput: ' + !!terminalInput);
  dLog('Found terminalBody: ' + !!terminalBody);

  if (terminalInput && terminalBody) {
    terminalInput.addEventListener('keydown', function (e) {
      dLog("KEY PRESSED: " + e.key);
      if (e.key === 'Enter') {
        e.preventDefault(); // Prevent any default form/input behavior
        
        dLog("Terminal Enter pressed! Value: " + this.value);

        try {
          const command = this.value.trim().toLowerCase();
          const cmdRaw = this.value.trim();

          if (!command) return;
          dLog("Processing command: " + command);

          // Process command
          let response = '';
          const baseCommand = command.split(' ')[0];
          const args = command.substring(baseCommand.length).trim();

          switch (baseCommand) {
            case 'help':
              response = "Available commands:\n  whoami    - Display basic info\n  skills    - List technical skills\n  projects  - Show portfolio projects\n  education - Show academic history\n  socials   - Display social links\n  contact   - Show contact info\n  date      - Display current system time\n  theme     - Toggle light/dark mode\n  echo      - Print text directly\n  clear     - Clear terminal window";
              break;
            case 'whoami':
              response = "Ayush\nB.Tech Ed IT Student\nFull-Stack & Cybersecurity Enthusiast";
              break;
            case 'skills':
              response = "Languages: Python, JavaScript, HTML, CSS, Bash\nFrameworks: Django, FastAPI, React\nTools: Docker, Git, Linux, Burp Suite";
              break;
            case 'projects':
              response = "Public Projects: PyPortScan, CyberLens, SLS, Student Learning Analytics";
              break;
            case 'education':
              response = "B.Tech in Educational Information Technology (Ed. IT)\nFocusing on Software Engineering, Networking, and Pedagogy.";
              break;
            case 'socials':
              response = "GitHub:   github.com/logiclinguist8989\nLinkedIn: linkedin.com/in/ayushhamal";
              break;
            case 'contact':
              response = "Email: ayushhamal.aspire.ku@gmail.com\nLocation: Nepal\nAlternatively, reach out via the secure form below!";
              break;
            case 'date':
              response = new Date().toString();
              break;
            case 'theme':
              const currentTheme = document.documentElement.getAttribute('data-theme');
              const newTheme = currentTheme === 'light' ? 'dark' : 'light';
              document.documentElement.setAttribute('data-theme', newTheme);
              localStorage.setItem('theme', newTheme);
              response = `System theme dynamically updated to [${newTheme} mode].`;
              break;
            case 'echo':
              response = args ? args : "echo: missing string operand";
              break;
            case 'clear':
              while (terminalBody.children.length > 1) {
                terminalBody.removeChild(terminalBody.firstChild);
              }
              this.value = '';
              return;
            case 'sudo':
              response = "ayush is not in the sudoers file. This incident will be reported.";
              break;
            case 'matrix':
              document.documentElement.setAttribute('data-theme', 'dark');
              const matCanvas = document.getElementById('matrix-canvas');
              if (matCanvas) {
                matCanvas.style.opacity = '1';
                matCanvas.style.filter = 'contrast(200%) brightness(150%) hue-rotate(90deg)';
                setTimeout(() => matCanvas.style.filter = '', 5000);
              }
              response = "Wake up, Neo... The Matrix has you.";
              break;
            case 'gui':
              document.body.style.animation = "glitch-anim 0.3s 3";
              setTimeout(() => document.body.style.animation = "", 900);
              response = "GUI rebooting. Critical error 404: grass not found.";
              break;
            default:
              response = `bash: ${command}: command not found. Type 'help' for available commands.`;
          }

          dLog("Response generated.");

          const userCmdLine = document.createElement('div');
          userCmdLine.className = 'terminal-input-line';
          userCmdLine.style.marginBottom = '8px';

          const prefixSpan = document.createElement('span');
          prefixSpan.className = 'terminal-prefix';
          prefixSpan.textContent = 'guest@ayush-portfolio:~$ ';

          const cmdSpan = document.createElement('span');
          cmdSpan.style.color = 'var(--text-primary)';
          cmdSpan.style.fontFamily = 'var(--font-mono)';
          cmdSpan.textContent = cmdRaw;

          userCmdLine.appendChild(prefixSpan);
          userCmdLine.appendChild(cmdSpan);

          const inputLine = terminalInput.parentElement;
          dLog("inputLine found: " + !!inputLine);
          
           if (inputLine && inputLine.parentNode === terminalBody) {
             dLog("Inserting userCmdLine");
             terminalBody.insertBefore(userCmdLine, inputLine);

             if (response) {
               dLog("Inserting responseElement");
               const responseElement = document.createElement('p');
               responseElement.className = 'terminal-response';
               terminalBody.insertBefore(responseElement, inputLine);
               
               // Typewriter Effect Logic
               let i = 0;
               terminalInput.disabled = true;
               responseElement.innerHTML = '<span class="typing-cursor"></span>';
               
               function typeChar() {
                 if (i < response.length) {
                   // Ensure HTML is escaped if needed, but here our response is safe strings
                   responseElement.innerHTML = response.substring(0, i + 1) + '<span class="typing-cursor"></span>';
                   i++;
                   terminalBody.scrollTop = terminalBody.scrollHeight;
                   
                   // Delay to mimic realistic mechanical typing
                   let baseDelay = 15;
                   if (response.charAt(i - 1) === '\\n') baseDelay = 150; // Pause at line breaks
                   setTimeout(typeChar, baseDelay + Math.random() * 25);
                 } else {
                   responseElement.innerHTML = response; // Strip cursor completely
                   terminalInput.disabled = false;
                   terminalInput.focus();
                   terminalBody.scrollTop = terminalBody.scrollHeight; // Final scroll check
                 }
               }
               
               // Initial computational processing pause
               setTimeout(typeChar, 250);
             }
          } else {
             dLog("ERROR: DOM mismatch! Cannot insert.");
          }

          this.value = '';
          terminalBody.scrollTop = terminalBody.scrollHeight;
          dLog("Terminal update complete.");
        } catch (err) {
          dLog("Terminal Error: " + err.message);
        }
      }
    });

    // Focus input when clicking anywhere in terminal body
    terminalBody.addEventListener('click', () => {
      terminalInput.focus();
    });
  }

  // 8. Advanced Binary Matrix Rain Animation
  const canvas = document.getElementById('matrix-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    
    let width, height;
    function resizeCanvas() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const characters = '01';
    const fontSize = 16;
    let columns = [];
    
    // Track mouse for interactive glitch effect
    let mouse = { x: -1000, y: -1000, active: false };
    window.addEventListener('mousemove', (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
    });
    window.addEventListener('mouseout', () => { mouse.active = false; });

    function initColumns() {
      columns = [];
      const colCount = Math.floor(width / fontSize) + 2; 
      for (let i = 0; i < colCount; i++) {
        columns.push({
          x: i * fontSize,
          y: Math.random() * -height * 2, // Start randomly way above screen
          speed: Math.random() * 2.5 + 0.5, // Parallax depth via speeds (0.5 to 3.0)
          opacity: Math.random() * 0.6 + 0.4  // Depth via opacity (0.4 to 1.0)
        });
      }
    }
    initColumns();
    window.addEventListener('resize', initColumns);

    let lastTime = 0;
    const fps = 30; // 30 FPS for standard matrix feel, but using rAF for smoothness
    const interval = 1000 / fps;

    function drawBinaryRain(time) {
      if (time - lastTime < interval) {
        requestAnimationFrame(drawBinaryRain);
        return;
      }
      lastTime = time;

      // Check theme to correctly fade the trails without muddying the background
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      
      // Fade out background to create trails
      ctx.fillStyle = isLight ? 'rgba(255, 255, 255, 0.15)' : 'rgba(2, 6, 23, 0.15)';
      ctx.fillRect(0, 0, width, height);

      const rootStyles = getComputedStyle(document.documentElement);
      const color1 = rootStyles.getPropertyValue('--accent-primary').trim() || '#3b82f6';
      const color2 = rootStyles.getPropertyValue('--accent-secondary').trim() || '#ec4899';
      
      ctx.font = 'bold ' + fontSize + 'px monospace';

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        
        // Pick random binary character
        const text = characters.charAt(Math.floor(Math.random() * characters.length));
        
        let drawX = col.x;
        let drawY = col.y;
        let isHovered = false;
        
        // Magnetic/Glitch effect near mouse
        if (mouse.active) {
          const dx = mouse.x - col.x;
          const dy = mouse.y - col.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 120) {
            // Scatter X based on distance
            const force = (120 - dist) / 120;
            drawX += (Math.random() - 0.5) * 30 * force;
            isHovered = true;
          }
        }

        // Color and Glow logic
        if (isHovered) {
          // Intense white glitch interaction
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 15;
          ctx.shadowColor = color2;
          ctx.globalAlpha = 1.0;
        } else if (Math.random() > 0.98) {
          // Occasional secondary accent colored blip
          ctx.fillStyle = color2;
          ctx.shadowBlur = 8;
          ctx.shadowColor = color2;
          ctx.globalAlpha = col.opacity;
        } else {
          // Standard primary accent trail
          ctx.fillStyle = color1;
          ctx.shadowBlur = 2;
          ctx.shadowColor = color1;
          ctx.globalAlpha = col.opacity;
        }
        
        // Draw the character
        ctx.fillText(text, drawX, drawY);
        
        // Reset globals
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;

        // Move down based on personal speed, giving a 3D parallax sliding effect
        col.y += col.speed * fontSize * 0.75;

        // Reset to top randomly when off screen
        if (col.y > height && Math.random() > 0.90) {
          col.y = Math.random() * -100;
          col.speed = Math.random() * 2.5 + 0.5; // Assign new depth/speed
        }
      }
      
      requestAnimationFrame(drawBinaryRain);
    }
    
    // Start animation
    requestAnimationFrame(drawBinaryRain);
  }

  // 9. Toast Notification System for Placeholder Links
  const placeholders = document.querySelectorAll('.notify-placeholder');
  const toast = document.getElementById('toast');
  let toastTimeout;

  const showToast = (message, duration = 3000) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  };

  placeholders.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const message = link.getAttribute('data-toast') || 'Feature coming soon!';
      showToast(message);
    });
  });

  // 10. EmailJS Contact Form Integration
  const contactForm = document.getElementById('contact-form');
  const submitBtn = document.getElementById('submit-btn');

  if (contactForm && typeof emailjs !== 'undefined') {
    // Initialize EmailJS with your Public Key
    // USER: Replace 'YOUR_PUBLIC_KEY' with your actual EmailJS public key
    emailjs.init("YOUR_PUBLIC_KEY");

    contactForm.addEventListener('submit', function(event) {
      event.preventDefault();
      
      const btnText = submitBtn.querySelector('.btn-text');
      const originalText = btnText.textContent;
      
      // Loading state
      submitBtn.disabled = true;
      btnText.textContent = 'Sending...';
      
      // USER: Replace 'YOUR_SERVICE_ID' and 'YOUR_TEMPLATE_ID'
      emailjs.sendForm('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', this)
        .then(() => {
          showToast('Message sent successfully! I will get back to you soon.');
          contactForm.reset();
        }, (error) => {
          console.error('EmailJS Error:', error);
          showToast('Failed to send message. Please try again or email me directly.');
        })
        .finally(() => {
          submitBtn.disabled = false;
          btnText.textContent = originalText;
        });
    });
  }
});