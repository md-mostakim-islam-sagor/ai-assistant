if (window.lucide) lucide.createIcons();

const form = document.getElementById('login-form');
const errorBox = document.getElementById('error-box');
const loginBtn = document.getElementById('login-btn');

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.style.display = 'none';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (res.ok && data.success) {
            window.location.href = '/?admin';
        } else {
            errorBox.textContent = data.error?.message || 'Login failed.';
            errorBox.style.display = 'block';
        }
    } catch (err) {
        errorBox.textContent = 'Network error: ' + err.message;
        errorBox.style.display = 'block';
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
    }
});
