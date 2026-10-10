let cloudUser = null;
let cloudRevision = -1;
let cloudSnapshot = null;
let cloudReady = false;
let cloudBusy = false;
let cloudRefreshing = false;
let cloudEpoch = 0;
let cloudTimer = null;
let failedDraft = null;
let authMode = 'login';
let authWorking = false;
let inviteToken = null;

function authMessage(message) {
    document.getElementById('auth-message').textContent = message;
}

function setAuthMode(mode) {
    if (authWorking) return;
    authMode = mode;
    const resetting = mode === 'reset' || mode === 'invite';
    document.getElementById('auth-email-box').classList.toggle('hidden', resetting);
    document.getElementById('auth-email').required = !resetting;
    document.getElementById('auth-password-box').classList.toggle('hidden', mode === 'recovery');
    document.getElementById('auth-password').required = mode !== 'recovery';
    document.getElementById('auth-password').value = '';
    document.getElementById('auth-password').minLength = mode === 'login' || mode === 'recovery' ? 0 : 10;
    document.getElementById('auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    document.getElementById('auth-confirm-box').classList.toggle('hidden', !resetting);
    document.getElementById('auth-confirm').required = resetting;
    document.getElementById('auth-links').classList.toggle('hidden', resetting);
    const headings = { login: 'Hesabınıza giriş yapın', signup: 'Patron hesabını oluşturun', recovery: 'Şifre belirleme bağlantısı isteyin', reset: 'Yeni şifrenizi belirleyin', invite: 'Hesabınızın şifresini belirleyin' };
    const labels = { login: 'Giriş yap', signup: 'Hesap oluştur', recovery: 'Bağlantı gönder', reset: 'Şifreyi kaydet', invite: 'Hesabı etkinleştir' };
    document.getElementById('auth-heading').textContent = headings[mode];
    document.getElementById('auth-submit').textContent = labels[mode];
    authMessage(mode === 'signup' ? 'Bu işlem yalnızca belirttiğiniz patron e-posta adresine açıktır. Doğrulama bağlantısı e-postayla gönderilir.' : resetting ? 'En az 10 karakterlik bir şifre belirleyin.' : 'E-posta adresinizi kullanın. Personel hesaplarını patron oluşturur.');
}

function lockCloud(message) {
    cloudEpoch += 1;
    clearInterval(cloudTimer);
    clearTimeout(sessionTimer);
    cloudUser = null;
    cloudReady = false;
    cloudRevision = -1;
    cloudSnapshot = null;
    failedDraft = null;
    db = loadDbDefaults({});
    currentRole = 'staff';
    if (chartGiderRef) { chartGiderRef.destroy(); chartGiderRef = null; }
    if (chartKarRef) { chartKarRef.destroy(); chartKarRef = null; }
    document.body.classList.add('auth-locked');
    document.getElementById('auth-screen').classList.remove('hidden');
    closeModal();
    document.getElementById('modal-body').replaceChildren();
    document.getElementById('modal-save-btn').onclick = null;
    document.querySelectorAll('main input').forEach(input => { if (input.type !== 'checkbox') input.value = ''; });
    renderAll();
    document.getElementById('personnel-list').replaceChildren();
    document.getElementById('auth-password').value = '';
    document.getElementById('cfg-admin-pass').value = '';
    if (!authWorking) setAuthMode('login');
    if (message) authMessage(message);
}

async function logoutCloud() {
    lockCloud('Oturum kapatıldı.');
    try { await window.cloudIdentity.logout(); }
    catch { authMessage('Uygulama kilitlendi. Güvenli çıkışı tamamlamak için bağlantınızı kontrol edin.'); }
}

async function cloudRequest(path, options = {}) {
    const user = await window.cloudIdentity.getUser();
    if (!user) {
        const error = new Error('Oturumunuz kapandı. Tekrar giriş yapın.');
        error.status = 401;
        lockCloud(error.message);
        throw error;
    }
    const response = await fetch('/.netlify/functions/' + path, {
        credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000),
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('Ortak kayıt servisi hazır değil. Yayının tamamlandığını ve internet bağlantınızı kontrol edin.'); }
    if (!response.ok) {
        const error = new Error(payload.error || 'İşlem tamamlanamadı.');
        error.status = response.status;
        if (response.status === 401 || response.status === 403) lockCloud(error.message);
        throw error;
    }
    return payload;
}

function setCloudStatus(message, healthy) {
    document.getElementById('cloud-status').textContent = message;
    document.getElementById('cloud-status').className = healthy ? 'text-emerald-700' : 'text-amber-700';
    document.body.classList.toggle('cloud-offline', !healthy);
}

function cloudError(message) {
    document.getElementById('cloud-error-text').textContent = message;
    document.getElementById('cloud-error-box').classList.remove('hidden');
    document.getElementById('draft-download').classList.toggle('hidden', !failedDraft || currentRole !== 'admin');
}

function acceptCloud(payload, force = false) {
    cloudUser = payload.user;
    document.getElementById('account-label').textContent = (cloudUser.role === 'admin' ? 'Patron' : 'Personel') + ' · ' + cloudUser.name;
    if (payload.data && (force || payload.revision !== cloudRevision || currentRole !== cloudUser.role)) {
        cloudRevision = payload.revision;
        db = loadDbDefaults(payload.data);
        cloudSnapshot = structuredClone(db);
        const roleChanged = currentRole !== cloudUser.role;
        if (roleChanged) {
            closeModal();
            if (cloudUser.role !== 'admin') {
                if (chartGiderRef) { chartGiderRef.destroy(); chartGiderRef = null; }
                if (chartKarRef) { chartKarRef.destroy(); chartKarRef = null; }
            }
        }
        switchRole(cloudUser.role);
        if (roleChanged && cloudUser.role === 'staff') {
            document.querySelectorAll('.tab-content').forEach(element => element.classList.remove('active'));
            document.getElementById('tab-garaj').classList.add('active');
            document.querySelectorAll('.sidebar-btn').forEach(element => element.classList.remove('active'));
            document.querySelector('[onclick*="showTab(\'tab-garaj\'"]').classList.add('active');
        }
    }
    cloudReady = true;
    setCloudStatus('Senkron · ' + new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), true);
    if (!failedDraft) document.getElementById('cloud-error-box').classList.add('hidden');
}

async function connectCloud() {
    const epoch = ++cloudEpoch;
    clearInterval(cloudTimer);
    try {
        const payload = await cloudRequest('shared-data');
        if (epoch !== cloudEpoch) return false;
        acceptCloud(payload, true);
        document.body.classList.remove('auth-locked');
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('auth-password').value = '';
        document.getElementById('auth-confirm').value = '';
        cloudTimer = setInterval(() => { if (!document.hidden) refreshCloud(); }, 5000);
        return true;
    } catch (error) {
        if (epoch === cloudEpoch) authMessage(error.message || 'Bağlantı kurulamadı. Tekrar deneyin.');
        return false;
    }
}

async function refreshCloud(force = false) {
    if (!cloudUser || cloudBusy || cloudRefreshing) return;
    if (!document.getElementById('edit-modal').classList.contains('hidden')) return;
    const epoch = cloudEpoch;
    cloudRefreshing = true;
    try {
        const suffix = force ? '' : '?revision=' + cloudRevision + '&role=' + cloudUser.role;
        const payload = await cloudRequest('shared-data' + suffix);
        if (epoch !== cloudEpoch || cloudBusy || !document.getElementById('edit-modal').classList.contains('hidden')) return;
        acceptCloud(payload, force);
        if (force) showToast('Ortak kayıtlar güncellendi.', 'ok');
    } catch (error) {
        if (epoch !== cloudEpoch) return;
        cloudReady = false;
        setCloudStatus('Bağlantı yok · kayıt ekleme durduruldu', false);
        cloudError(error.message || 'İnternet bağlantısı kesildi. Ekrandaki bilgiler son alınan kayıtlardır.');
    } finally { cloudRefreshing = false; }
}

function canWrite(role) {
    if (cloudBusy) { showToast('Önce devam eden kaydın tamamlanmasını bekleyin.', 'err'); return false; }
    if (!cloudReady || !cloudUser || !navigator.onLine) { showToast('Kayıt için bağlantınızı kontrol edin ve Yenile düğmesine basın.', 'err'); return false; }
    if (role === 'admin' && cloudUser.role !== 'admin') { showToast('Bu işlem yalnızca patron hesabına açıktır.', 'err'); return false; }
    return true;
}

async function saveCloudData(silent) {
    if (!canWrite()) {
        if (cloudSnapshot) { db = structuredClone(cloudSnapshot); renderAll(); }
        return false;
    }
    const draft = structuredClone(db);
    const epoch = cloudEpoch;
    let body = { action: 'save', revision: cloudRevision, data: draft };
    if (cloudUser.role !== 'admin') {
        const known = new Set(cloudSnapshot.giderler.map(item => item.id));
        const added = draft.giderler.filter(item => !known.has(item.id));
        if (added.length !== 1) {
            db = structuredClone(cloudSnapshot);
            renderAll();
            showToast('Personel yalnızca yeni masraf ekleyebilir.', 'err');
            return false;
        }
        body = { action: 'expense', expense: added[0] };
    }
    cloudBusy = true;
    document.body.classList.add('cloud-busy');
    setCloudStatus('Ortak sisteme kaydediliyor…', true);
    try {
        const payload = await cloudRequest('shared-data', { method: 'POST', body: JSON.stringify(body) });
        if (epoch !== cloudEpoch) return false;
        failedDraft = null;
        acceptCloud(payload, true);
        if (!silent) showToast('Ortak sisteme kaydedildi.', 'ok');
        return true;
    } catch (error) {
        if (epoch !== cloudEpoch) return false;
        failedDraft = cloudUser?.role === 'admin' ? draft : null;
        db = structuredClone(cloudSnapshot);
        renderAll();
        if (error.status === 409) {
            try {
                const current = await cloudRequest('shared-data');
                if (epoch === cloudEpoch) acceptCloud(current, true);
            } catch { cloudReady = false; }
        } else if (!error.status || error.status >= 500) cloudReady = false;
        setCloudStatus(error.status === 409 ? 'Kayıt çakıştı · güncel listeyi kontrol edin' : 'Değişiklik kaydedilemedi', false);
        cloudError((error.message || 'Bağlantı kesildi.') + ' İşlem onaylanmadı; güncel kayıtları kontrol edip tekrar deneyin.');
        showToast('Kaydetme onaylanmadı.', 'err');
        return false;
    } finally {
        cloudBusy = false;
        document.body.classList.remove('cloud-busy');
    }
}

function downloadJson(data, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadFailedDraft() {
    if (failedDraft && currentRole === 'admin') downloadJson(failedDraft, 'Ceyhan_Tarim_Kaydedilemeyen_Degisiklik.json');
}

async function importLegacyData() {
    if (!canWrite('admin')) return;
    try {
        const source = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
        if (!source) { showToast('Bu tarayıcıda eski kayıt bulunamadı. Eski HTML dosyanızdan JSON yedek indirip yükleyin.', 'err'); return; }
        const incoming = loadDbDefaults(JSON.parse(source));
        if (!confirm('Eski kayıtlar TÜM cihazlardaki ortak kayıtların yerine geçecek. Güncel JSON yedeğinizi indirdiniz mi? Devam edilsin mi?')) return;
        db = incoming;
        if (await saveData(true)) showToast('Eski kayıtlar ortak sisteme aktarıldı. Yerel yedeğiniz korundu.', 'ok');
    } catch { showToast('Eski kayıt okunamadı. JSON yedek yüklemeyi deneyin.', 'err'); }
}

function authFailure(error) {
    if (error?.status === 401 || error?.status === 400) return 'Giriş bilgileri veya bağlantı geçersiz. E-posta adresinizi ve şifrenizi kontrol edin; e-postanızdaki doğrulama bağlantısını açın.';
    if (error?.status === 403) return 'Hesap açma kapalı veya erişiminiz yok. Personel hesabınızı patron tanımlar.';
    if (error?.status === 422) return 'Bu e-posta zaten kayıtlı olabilir veya bilgiler geçersiz. Giriş ya da şifre belirleme bağlantısını kullanın.';
    return 'İşlem tamamlanamadı. İnternet bağlantınızı ve hesabınızın doğrulandığını kontrol edin.';
}

async function submitAuth(event) {
    event.preventDefault();
    if (authWorking || !window.cloudIdentity) return;
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (['reset', 'invite'].includes(authMode) && password !== document.getElementById('auth-confirm').value) { authMessage('Şifreler aynı olmalıdır.'); return; }
    authWorking = true;
    document.getElementById('auth-submit').disabled = true;
    authMessage('İşlem sürüyor…');
    try {
        if (authMode === 'recovery') {
            await window.cloudIdentity.requestPasswordRecovery(email);
            authMessage('Bu adrese ait hesap varsa şifre belirleme bağlantısı gönderildi. Gelen kutunuzu ve spam klasörünü kontrol edin.');
        } else if (authMode === 'signup') {
            const user = await window.cloudIdentity.signup(email, password, { full_name: 'Patron' });
            if (user.confirmedAt) await connectCloud();
            else authMessage('Doğrulama e-postası gönderildi. Gelen kutunuzdaki bağlantıyı açın; ardından giriş yapın.');
        } else {
            if (authMode === 'invite') {
                await window.cloudIdentity.acceptInvite(inviteToken, password);
                inviteToken = null;
            } else if (authMode === 'reset') {
                await window.cloudIdentity.updateUser({ password });
            } else {
                await window.cloudIdentity.login(email, password);
            }
            await connectCloud();
        }
    } catch (error) { authMessage(authFailure(error)); }
    finally {
        authWorking = false;
        document.getElementById('auth-submit').disabled = false;
        document.getElementById('auth-password').value = '';
        document.getElementById('auth-confirm').value = '';
    }
}

async function initializeCloud() {
    authWorking = true;
    try {
        const result = await window.cloudIdentity.handleAuthCallback();
        authWorking = false;
        if (result?.type === 'invite' || result?.type === 'recovery') {
            inviteToken = result.token || null;
            setAuthMode(result.type === 'invite' ? 'invite' : 'reset');
        } else if (await window.cloudIdentity.getUser()) await connectCloud();
        else setAuthMode('login');
        window.cloudIdentity.onAuthChange((event) => {
            if (event === window.cloudIdentity.AUTH_EVENTS.LOGOUT) lockCloud('Oturum kapatıldı.');
            if (event === window.cloudIdentity.AUTH_EVENTS.LOGIN && !authWorking && !cloudUser && !['reset', 'invite'].includes(authMode)) connectCloud();
        });
    } catch (error) {
        authWorking = false;
        setAuthMode('login');
        authMessage(authFailure(error));
    } finally { document.getElementById('auth-submit').disabled = false; }
}

async function loadPersonnel() {
    if (cloudUser?.role !== 'admin') return;
    const epoch = cloudEpoch;
    const message = document.getElementById('personnel-message');
    try {
        const payload = await cloudRequest('personnel');
        if (epoch !== cloudEpoch) return;
        const list = document.getElementById('personnel-list');
        list.replaceChildren();
        if (!payload.users.length) list.textContent = 'Henüz personel hesabı yok.';
        payload.users.forEach(user => {
            const row = document.createElement('div');
            row.className = 'flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 p-3 text-xs';
            const label = document.createElement('span');
            label.textContent = user.name + ' · ' + user.email;
            const actions = document.createElement('div');
            actions.className = 'flex gap-3';
            const resend = document.createElement('button');
            resend.className = 'text-blue-700 font-semibold';
            resend.textContent = 'Şifre bağlantısı';
            resend.onclick = async () => {
                resend.disabled = true;
                try { await window.cloudIdentity.requestPasswordRecovery(user.email); message.textContent = 'Şifre belirleme bağlantısı gönderildi.'; }
                catch { message.textContent = 'E-posta gönderilemedi. Tekrar deneyin.'; }
                finally { resend.disabled = false; }
            };
            const remove = document.createElement('button');
            remove.className = 'text-red-600 font-semibold';
            remove.textContent = 'Erişimi kaldır';
            remove.onclick = async () => {
                if (!confirm('Bu personelin hesabı ve site erişimi kaldırılsın mı? Masraf kayıtları korunur.')) return;
                remove.disabled = true;
                try { await cloudRequest('personnel', { method: 'DELETE', body: JSON.stringify({ id: user.id }) }); await loadPersonnel(); }
                catch (error) { message.textContent = error.message; }
                finally { remove.disabled = false; }
            };
            actions.append(resend, remove);
            row.append(label, actions);
            list.append(row);
        });
    } catch (error) { if (epoch === cloudEpoch) message.textContent = error.message; }
}

async function personnelAdd(event) {
    event.preventDefault();
    if (!canWrite('admin')) return;
    const button = document.getElementById('personnel-submit');
    const message = document.getElementById('personnel-message');
    const email = document.getElementById('personnel-email').value.trim();
    const name = document.getElementById('personnel-name').value.trim();
    button.disabled = true;
    message.textContent = 'Personel hesabı oluşturuluyor…';
    try {
        await cloudRequest('personnel', { method: 'POST', body: JSON.stringify({ email, name }) });
        try {
            await window.cloudIdentity.requestPasswordRecovery(email);
            message.textContent = 'Hesap oluşturuldu; şifre belirleme bağlantısı gönderildi. Personel e-postasındaki bağlantıyı açabilir.';
        } catch { message.textContent = 'Hesap oluşturuldu ancak e-posta gönderilemedi. Listeden Şifre bağlantısı düğmesine basın.'; }
        document.getElementById('personnel-name').value = '';
        document.getElementById('personnel-email').value = '';
        await loadPersonnel();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
}

document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.closest('#auth-screen') || button.classList.contains('local-action') || button.classList.contains('sidebar-btn')) return;
    if (cloudBusy || !cloudReady || !navigator.onLine) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showToast(cloudBusy ? 'Kaydın tamamlanmasını bekleyin.' : 'Bağlantı yok. Yenile düğmesine basın.', 'err');
    }
}, true);

document.addEventListener('change', (event) => {
    if (cloudBusy && event.target.closest('main')) {
        event.stopImmediatePropagation();
        showToast('Kaydın tamamlanmasını bekleyin.', 'err');
    }
}, true);

window.addEventListener('online', () => refreshCloud(true));
window.addEventListener('offline', () => {
    cloudReady = false;
    setCloudStatus('İnternet bağlantısı kesildi', false);
    if (cloudUser) cloudError('Son alınan kayıtlar gösteriliyor. Yeni kayıt için internet bağlantısı gereklidir.');
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCloud(); });
window.addEventListener('beforeunload', (event) => { if (cloudBusy || failedDraft) { event.preventDefault(); event.returnValue = ''; } });
setTimeout(() => {
    if (!window.cloudIdentity) authMessage('Giriş modülü yüklenemedi. Yayının tamamlandığını ve internet bağlantısını kontrol edip sayfayı yenileyin.');
}, 15000);
