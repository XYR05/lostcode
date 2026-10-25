// app.js - Lost Code Authentication

const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) loginError.textContent = '';

    const teamInput = document.getElementById('loginTeam');
    const passwordInput = document.getElementById('loginPassword');
    const teamName = teamInput ? teamInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!teamName || !password) {
      if (loginError) loginError.textContent = 'Both crew name and password are required.';
      return;
    }

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Boarding Ship...';
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamName, password })
      });
      const data = await res.json();

      if (!res.ok) {
        if (loginError) loginError.textContent = data.error || 'Login failed.';
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Board the Ship';
        }
      } else {
        // Clear intro modal storage flags
        sessionStorage.removeItem('lostCodeIntroSeen');
        sessionStorage.removeItem('coreDumpIntroSeen');
        window.location.href = '/dashboard';
      }
    } catch (err) {
      if (loginError) loginError.textContent = 'Could not connect to Admiralty server.';
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Board the Ship';
      }
      console.error(err);
    }
  });
}
