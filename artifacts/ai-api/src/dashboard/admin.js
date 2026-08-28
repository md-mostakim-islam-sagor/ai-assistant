if (window.lucide) lucide.createIcons();

function showMsg(el, text, type) {
    el.textContent = text;
    el.className = type === 'error' ? 'error-box' : 'success-box';
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

async function loadMe() {
    try {
        const res = await fetch('/api/admin/me');
        if (!res.ok) {
            window.location.href = '/?admin';
            return;
        }
        const data = await res.json();
        document.getElementById('welcome-text').textContent = `Logged in as ${data.username}`;
    } catch (e) {
        window.location.href = '/?admin';
    }
}

function timeAgo(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

async function loadStats() {
    try {
        const res = await fetch('/api/admin/stats');
        if (!res.ok) {
            window.location.href = '/?admin';
            return;
        }
        const data = await res.json();

        document.getElementById('stat-total').textContent = data.totalCalls;
        document.getElementById('stat-chat').textContent = data.chatCalls;
        document.getElementById('stat-image').textContent = data.imageCalls;
        document.getElementById('stat-users').textContent = data.uniqueUsers;
        document.getElementById('masked-key').textContent = data.maskedApiKey;

        const list = document.getElementById('recent-list');
        if (!data.recent || data.recent.length === 0) {
            list.innerHTML = '<p style="font-size:13px; color:#5a5a5f;">No activity yet.</p>';
        } else {
            list.innerHTML = data.recent.map(item => `
                <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 10px; background:rgba(255,255,255,0.03); border-radius:8px;">
                    <div style="display:flex; align-items:center; gap:8px; min-width:0;">
                        <span style="font-size:11px; padding:2px 8px; border-radius:99px; background:${item.type === 'chat' ? 'rgba(255,51,102,0.15); color:#ff8099' : 'rgba(168,85,247,0.15); color:#d8b4fe'};">${item.type}</span>
                        <span style="font-size:13px; color:#c0c0c5; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:340px;">${item.detail || '(empty)'}</span>
                    </div>
                    <span style="font-size:11px; color:#5a5a5f; flex-shrink:0; margin-left:10px;">${timeAgo(item.time)}</span>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error(e);
    }
}

document.getElementById('apikey-save').addEventListener('click', async () => {
    const input = document.getElementById('apikey-input');
    const msg = document.getElementById('apikey-msg');
    const key = input.value.trim();
    if (!key) {
        showMsg(msg, 'Please enter an API key.', 'error');
        return;
    }
    try {
        const res = await fetch('/api/admin/apikey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: key })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showMsg(msg, 'API key updated successfully.', 'success');
            input.value = '';
            loadStats();
        } else {
            showMsg(msg, data.error?.message || 'Failed to update key.', 'error');
        }
    } catch (e) {
        showMsg(msg, 'Network error: ' + e.message, 'error');
    }
});

document.getElementById('cred-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('cred-msg');
    const currentPassword = document.getElementById('current-password').value;
    const newUsername = document.getElementById('new-username').value.trim();
    const newPassword = document.getElementById('new-password').value.trim();

    try {
        const res = await fetch('/api/admin/credentials', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newUsername, newPassword })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showMsg(msg, 'Login credentials updated.', 'success');
            document.getElementById('cred-form').reset();
            loadMe();
        } else {
            showMsg(msg, data.error?.message || 'Update failed.', 'error');
        }
    } catch (err) {
        showMsg(msg, 'Network error: ' + err.message, 'error');
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/?admin';
});

loadMe();
loadStats();
setInterval(loadStats, 15000);
