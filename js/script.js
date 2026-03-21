document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize AOS (Animate On Scroll)
  if (typeof AOS !== 'undefined') {
    AOS.init({
      duration: 800,
      easing: 'ease-in-out',
      once: true,
      offset: 50,
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

  // 8. Interactive Terminal Logic
  const terminalInput = document.getElementById('terminal-input');
  const terminalBody = document.getElementById('terminal-body');

  if (terminalInput && terminalBody) {
    terminalInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault(); // Prevent any default form/input behavior

        try {
          const command = this.value.trim().toLowerCase();
          const cmdRaw = this.value.trim();

          if (!command) return;

          // Process command
          let response = '';
          switch (command) {
            case 'help':
              response = "Available commands:\n" +
                "  whoami      - display current user info\n" +
                "  skills      - list technical skills & expertise\n" +
                "  projects    - list featured projects\n" +
                "  contact     - show contact information\n" +
                "  clear       - clear terminal output\n" +
                "\nTip: Scroll down to view projects or use the navigation bar!";
              break;
            case 'whoami':
              response = "Ayush\nB.Tech Ed IT Student\nFull-Stack & Cybersecurity Enthusiast";
              break;
            case 'skills':
              response = "Languages: Python, JavaScript, HTML, CSS, Bash\n" +
                "Frameworks: Django, Flask, FastAPI, Bootstrap 5\n" +
                "Databases: MySQL, SQLite, PostgreSQL\n" +
                "Tools & Services: Git, Linux, Docker, Celery, Redis\n" +
                "Specialties: Cybersecurity, Full-Stack, Browser Extensions, ERP Systems";
              break;
            case 'projects':
              response = "Public Projects:\n" +
                "1. PyPortScan - Port scanning tool (Python)\n" +
                "2. Student-Learning-Analytics - ML dropout prediction (Python)\n" +
                "3. SLS - Python utilities (Python)\n\n" +
                "Private Projects:\n" +
                "1. CyberLens - Network monitoring dashboard (Flask, Docker)\n" +
                "2. Exam Seating Automation - EdTech platform (Django, MySQL)\n" +
                "3. SafeClick - Phishing detection extension (FastAPI, JS)\n" +
                "4. Gurans Sales Management - Enterprise ERP (Django 5.0, PG)";
              break;
            case 'contact':
              response = "Email: ayushhamal.aspire.ku@gmail.com\nLocation: Nepal\nReach out via the form below!";
              break;
            case 'clear':
              // Remove all children except the last one (input line)
              while (terminalBody.children.length > 1) {
                terminalBody.removeChild(terminalBody.firstChild);
              }
              this.value = '';
              return; // Don't add a response line
            default:
              response = `bash: ${command}: command not found. Type 'help' for available commands.`;
          }

          // Add user command to terminal visually
          const userCmdLine = document.createElement('div');
          // Add flex class so it matches input line layout
          userCmdLine.className = 'terminal-input-line';
          userCmdLine.style.marginBottom = '8px';

          const prefixSpan = document.createElement('span');
          prefixSpan.className = 'terminal-prefix';
          prefixSpan.textContent = 'guest@ayush-portfolio:~$';

          const cmdSpan = document.createElement('span');
          cmdSpan.style.color = 'var(--text-primary)';
          cmdSpan.style.fontFamily = 'var(--font-mono)';
          cmdSpan.style.marginLeft = '10px';
          cmdSpan.textContent = cmdRaw;

          userCmdLine.appendChild(prefixSpan);
          userCmdLine.appendChild(cmdSpan);

          const inputLine = document.querySelector('.terminal-input-line:last-child');
          terminalBody.insertBefore(userCmdLine, inputLine);

          // Add response to terminal
          if (response) {
            const responseElement = document.createElement('p');
            responseElement.className = 'terminal-response';
            responseElement.textContent = response;
            terminalBody.insertBefore(responseElement, inputLine);
          }

          // Clear input and scroll to bottom
          this.value = '';
          terminalBody.scrollTop = terminalBody.scrollHeight;
        } catch (err) {
          console.error("Terminal Error:", err);
        }
      }
    });

    // Focus input when clicking anywhere in terminal body
    terminalBody.addEventListener('click', () => {
      terminalInput.focus();
    });
  }

  // 8. Matrix Rain Animation (Disabled for now - causing rendering issues)
  // Will be re-enabled after verification
  const canvas = document.getElementById('matrix-canvas');
  if (canvas) {
    canvas.style.display = 'none';
  }

  // 9. Toast Notification System for Placeholder Links
  const placeholders = document.querySelectorAll('.notify-placeholder');
  const toast = document.getElementById('toast');
  let toastTimeout;

  placeholders.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault(); // Prevent jump to top of page

      const message = link.getAttribute('data-toast') || 'Feature coming soon!';

      // Update toast message
      toast.textContent = message;

      // Show toast
      toast.classList.add('show');
      toast.classList.remove('hidden'); // Just in case

      // Clear existing timeout if user clicks multiple times quickly
      clearTimeout(toastTimeout);

      // Hide toast after 3 seconds
      toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    });
  });
});