// app.js

// Grab references to container and toggle buttons
const container = document.querySelector('.container');
const signUpBtn = document.getElementById('signUpBtn');
const signInBtn = document.getElementById('signInBtn');

// Toggle "sign-up-mode" class to switch forms
signUpBtn.addEventListener('click', () => {
  container.classList.add('sign-up-mode');
});
signInBtn.addEventListener('click', () => {
  container.classList.remove('sign-up-mode');
});

// ===== Sign In Form =====
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  const teamName = document.getElementById('loginTeam').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!teamName || !password) {
    loginError.textContent = 'Both crew name and password are required.';
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName, password })
    });
    const data = await res.json();

    if (!res.ok) {
      loginError.textContent = data.error || 'Login failed.';
    } else {
      // On success, redirect to the dashboard
      sessionStorage.removeItem('lostCodeIntroSeen');
      sessionStorage.removeItem('coreDumpIntroSeen');
      window.location.href = '/dashboard';
    }
  } catch (err) {
    loginError.textContent = 'Could not connect to server.';
    console.error(err);
  }
});

// ===== Sign Up Form =====
const registerForm = document.getElementById('registerForm');
const registerError = document.getElementById('registerError');

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';

  const teamName = document.getElementById('registerTeamName').value.trim();
  const captainInput = document.getElementById('registerCaptain');
  const username = (captainInput && captainInput.value ? captainInput.value : teamName).trim();
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerConfirmPassword').value;

  // Basic validation
  if (!teamName || !password || !confirmPassword) {
    registerError.textContent = 'Crew name and passwords are required.';
    return;
  }
  if (password !== confirmPassword) {
    registerError.textContent = 'Passwords do not match.';
    return;
  }

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName, username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      registerError.textContent = data.error || 'Registration failed.';
    } else {
      // Create a custom popup modal
      const popup = document.createElement('div');
      popup.style.position = 'fixed';
      popup.style.top = '50%';
      popup.style.left = '50%';
      popup.style.transform = 'translate(-50%, -50%)';
      popup.style.background = 'var(--glass-bg)';
      popup.style.padding = '2rem';
      popup.style.borderRadius = '0';
      popup.style.border = '1px solid var(--accent)';
      popup.style.color = 'var(--text-primary)';
      popup.style.zIndex = '10000';
      popup.style.textAlign = 'center';
      popup.style.boxShadow = 'inset 0 0 20px rgba(200, 214, 75, 0.1), 0 10px 30px rgba(0, 0, 0, 0.8)';
      
      popup.innerHTML = `
        <h3 style="margin-bottom: 1rem; font-size: 1.5rem; color: var(--accent);">Crew Enlisted!</h3>
        <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">${data.message}</p>
        <button id="closePopupBtn" style="padding: 0.75rem 1.5rem; background: var(--accent-soft); color: var(--accent); border: 1px solid var(--accent); border-radius: 0; cursor: pointer; font-weight: 500;">Board Now</button>
      `;
      
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.background = 'rgba(0,0,0,0.7)';
      overlay.style.zIndex = '9999';
      overlay.style.backdropFilter = 'blur(4px)';
      
      document.body.appendChild(overlay);
      document.body.appendChild(popup);
      
      document.getElementById('closePopupBtn').addEventListener('click', () => {
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
      });

      // Auto-fill crew name on login form
      document.getElementById('loginTeam').value = teamName;
      
      registerForm.reset();
      container.classList.remove('sign-up-mode');
    }
  } catch (err) {
    registerError.textContent = 'Could not connect to server.';
    console.error(err);
  }
});
