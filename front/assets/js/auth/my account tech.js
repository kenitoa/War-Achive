// ── War Archive - My Account JavaScript ──

document.addEventListener('DOMContentLoaded', () => {

  // ── 로그인 확인 ──
  const currentUser = sessionStorage.getItem('warArchiveCurrentUser');
  if (!currentUser) {
    window.location.href = 'log in.html';
    return;
  }

  const user = JSON.parse(currentUser);

  // ── 헤더 로그인 상태 처리 ──
  const loginBtn = document.getElementById('loginBtn');
  const userMenu = document.getElementById('userMenu');
  const userMenuToggle = document.getElementById('userMenuToggle');
  const userMenuName = document.getElementById('userMenuName');
  const userDropdown = document.getElementById('userDropdown');
  const logoutBtn = document.getElementById('logoutBtn');

  if (loginBtn && userMenu) {
    loginBtn.style.display = 'none';
    userMenu.style.display = 'block';
    userMenuName.textContent = user.username || user.email;
  }

  if (userMenuToggle && userDropdown) {
    userMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => {
      userDropdown.classList.remove('open');
    });
    userDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('warArchiveCurrentUser');
      window.location.href = '../../index.html';
    });
  }

  // ── 사용자 데이터 로드 ──
  function getUsers() {
    const data = localStorage.getItem('warArchiveUsers');
    return data ? JSON.parse(data) : [];
  }

  function saveUsers(users) {
    localStorage.setItem('warArchiveUsers', JSON.stringify(users));
  }

  function findUser(email) {
    return getUsers().find(u => u.email === email);
  }

  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── 프로필 헤더에 정보 표시 ──
  const userData = findUser(user.email);
  const avatarImg = document.getElementById('avatarImg');
  const avatarInput = document.getElementById('avatarInput');
  const avatarDefaultIcon = document.querySelector('.avatar-default-icon');

  document.getElementById('accountUsername').textContent = user.username || '사용자';
  document.getElementById('accountEmail').textContent = user.email;

  // ── 프로필 사진 로드 ──
  const savedAvatar = localStorage.getItem('warArchiveAvatar_' + user.email);
  if (savedAvatar) {
    avatarImg.src = savedAvatar;
    avatarImg.style.display = 'block';
    if (avatarDefaultIcon) avatarDefaultIcon.style.display = 'none';
  }

  // ── 프로필 사진 업로드 ──
  avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 파일 크기 제한 (2MB)
    if (file.size > 2 * 1024 * 1024) {
      alert('이미지 크기는 2MB 이하여야 합니다.');
      return;
    }

    // 이미지 파일 확인
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      avatarImg.src = dataUrl;
      avatarImg.style.display = 'block';
      if (avatarDefaultIcon) avatarDefaultIcon.style.display = 'none';

      // localStorage에 저장
      localStorage.setItem('warArchiveAvatar_' + user.email, dataUrl);
    };
    reader.readAsDataURL(file);
  });

  if (userData) {
    document.getElementById('accountRole').textContent = (userData.role || 'user').toUpperCase();
    document.getElementById('acctUsername').value = userData.username || '';
    document.getElementById('acctEmail').value = userData.email || '';
    document.getElementById('acctBio').value = userData.bio || '';
    document.getElementById('acctEra').value = userData.favoriteEra || '';

    // 계정 활동
    if (userData.createdAt) {
      document.getElementById('acctCreatedAt').textContent = new Date(userData.createdAt).toLocaleDateString('ko-KR');
    }
    document.getElementById('acctLastLogin').textContent = new Date(user.loginTime).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  // ── 계정 정보 저장 ──
  const accountForm = document.getElementById('accountForm');
  const accountMessage = document.getElementById('accountMessage');

  accountForm.addEventListener('submit', (e) => {
    e.preventDefault();
    accountMessage.textContent = '';
    accountMessage.className = 'account-message';

    const newUsername = document.getElementById('acctUsername').value.trim();
    if (!newUsername || newUsername.length < 2) {
      accountMessage.textContent = '사용자 이름은 2자 이상이어야 합니다.';
      accountMessage.className = 'account-message error';
      return;
    }

    const users = getUsers();
    const idx = users.findIndex(u => u.email === user.email);
    if (idx !== -1) {
      users[idx].username = newUsername;
      users[idx].bio = document.getElementById('acctBio').value.trim();
      users[idx].favoriteEra = document.getElementById('acctEra').value;
      saveUsers(users);

      // 세션 정보도 업데이트
      const sessionUser = JSON.parse(sessionStorage.getItem('warArchiveCurrentUser'));
      sessionUser.username = newUsername;
      sessionStorage.setItem('warArchiveCurrentUser', JSON.stringify(sessionUser));

      // UI 반영
      document.getElementById('accountUsername').textContent = newUsername;
      if (userMenuName) userMenuName.textContent = newUsername;

      accountMessage.textContent = '변경 사항이 저장되었습니다.';
      accountMessage.className = 'account-message success';
    }
  });

  // ── 비밀번호 변경 ──
  const passwordForm = document.getElementById('passwordForm');
  const passwordMessage = document.getElementById('passwordMessage');

  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    passwordMessage.textContent = '';
    passwordMessage.className = 'account-message';

    const currentPw = document.getElementById('currentPw').value;
    const newPw = document.getElementById('newPw').value;
    const confirmPw = document.getElementById('confirmPw').value;

    if (!currentPw) {
      passwordMessage.textContent = '현재 비밀번호를 입력해주세요.';
      passwordMessage.className = 'account-message error';
      return;
    }

    if (!newPw || newPw.length < 8) {
      passwordMessage.textContent = '새 비밀번호는 8자 이상이어야 합니다.';
      passwordMessage.className = 'account-message error';
      return;
    }

    if (newPw !== confirmPw) {
      passwordMessage.textContent = '새 비밀번호가 일치하지 않습니다.';
      passwordMessage.className = 'account-message error';
      return;
    }

    const users = getUsers();
    const idx = users.findIndex(u => u.email === user.email);
    if (idx === -1) return;

    const currentHash = await hashPassword(currentPw);
    if (users[idx].passwordHash !== currentHash) {
      passwordMessage.textContent = '현재 비밀번호가 올바르지 않습니다.';
      passwordMessage.className = 'account-message error';
      return;
    }

    users[idx].passwordHash = await hashPassword(newPw);
    saveUsers(users);

    passwordMessage.textContent = '비밀번호가 변경되었습니다.';
    passwordMessage.className = 'account-message success';
    passwordForm.reset();
  });

  // ── 하단 로그아웃 ──
  const acctLogoutBtn = document.getElementById('acctLogoutBtn');
  if (acctLogoutBtn) {
    acctLogoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('warArchiveCurrentUser');
      window.location.href = '../../index.html';
    });
  }

  // ── 회원 탈퇴 ──
  const acctDeleteBtn = document.getElementById('acctDeleteBtn');
  const deleteOverlay = document.getElementById('deleteOverlay');
  const deleteCancelBtn = document.getElementById('deleteCancelBtn');
  const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');

  if (acctDeleteBtn && deleteOverlay) {
    acctDeleteBtn.addEventListener('click', () => {
      deleteOverlay.classList.add('active');
    });

    deleteCancelBtn.addEventListener('click', () => {
      deleteOverlay.classList.remove('active');
    });

    deleteOverlay.addEventListener('click', (e) => {
      if (e.target === deleteOverlay) {
        deleteOverlay.classList.remove('active');
      }
    });

    deleteConfirmBtn.addEventListener('click', () => {
      const users = getUsers();
      const filtered = users.filter(u => u.email !== user.email);
      saveUsers(filtered);
      sessionStorage.removeItem('warArchiveCurrentUser');
      window.location.href = '../../index.html';
    });
  }
});
