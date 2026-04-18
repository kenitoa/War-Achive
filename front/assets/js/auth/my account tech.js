// ── War Archive - My Account JavaScript (API 연동) ──

document.addEventListener('DOMContentLoaded', async () => {

  // ── 로그인 확인 ──
  if (!API.isLoggedIn()) {
    window.location.href = 'log in.html';
    return;
  }

  let user = API.getCurrentUser();
  if (!user) {
    // 세션 캐시 없으면 서버에서 가져오기
    try {
      const meData = await API.getMe();
      user = meData.user;
      API.setCurrentUser(user);
    } catch (err) {
      window.location.href = 'log in.html';
      return;
    }
  }

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
    logoutBtn.addEventListener('click', async () => {
      await API.logout();
      window.location.href = '../../index.html';
    });
  }

  // ── 프로필 정보 로드 (API) ──
  let profileData = null;
  try {
    profileData = await API.getProfile();
  } catch (err) {
    // 프로필 로드 실패 시 기본값 사용
  }

  const avatarImg = document.getElementById('avatarImg');
  const avatarInput = document.getElementById('avatarInput');
  const avatarDefaultIcon = document.querySelector('.avatar-default-icon');

  document.getElementById('accountUsername').textContent = user.username || '사용자';
  document.getElementById('accountEmail').textContent = user.email;

  if (profileData) {
    document.getElementById('accountRole').textContent = (profileData.role || user.role || 'user').toUpperCase();
    document.getElementById('acctUsername').value = profileData.username || user.username || '';
    document.getElementById('acctEmail').value = profileData.email || user.email || '';
    document.getElementById('acctBio').value = (profileData.profile && profileData.profile.bio) || '';
    document.getElementById('acctEra').value = (profileData.profile && profileData.profile.favorite_era) || '';

    if (profileData.profile && profileData.profile.avatar_url) {
      avatarImg.src = profileData.profile.avatar_url;
      avatarImg.style.display = 'block';
      if (avatarDefaultIcon) avatarDefaultIcon.style.display = 'none';
    }

    if (profileData.created_at) {
      document.getElementById('acctCreatedAt').textContent = new Date(profileData.created_at).toLocaleDateString('ko-KR');
    }
  } else {
    document.getElementById('accountRole').textContent = (user.role || 'user').toUpperCase();
    document.getElementById('acctUsername').value = user.username || '';
    document.getElementById('acctEmail').value = user.email || '';
  }

  // ── 프로필 사진 업로드 (로컬 저장 유지 - 향후 업로드 API 연동 가능) ──
  const savedAvatar = localStorage.getItem('warArchiveAvatar_' + user.email);
  if (savedAvatar && !avatarImg.src) {
    avatarImg.src = savedAvatar;
    avatarImg.style.display = 'block';
    if (avatarDefaultIcon) avatarDefaultIcon.style.display = 'none';
  }

  avatarInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('이미지 크기는 2MB 이하여야 합니다.');
      return;
    }

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
      localStorage.setItem('warArchiveAvatar_' + user.email, dataUrl);
    };
    reader.readAsDataURL(file);
  });

  // ── 계정 정보 저장 (API) ──
  const accountForm = document.getElementById('accountForm');
  const accountMessage = document.getElementById('accountMessage');

  accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    accountMessage.textContent = '';
    accountMessage.className = 'account-message';

    const newUsername = document.getElementById('acctUsername').value.trim();
    if (!newUsername || newUsername.length < 2) {
      accountMessage.textContent = '사용자 이름은 2자 이상이어야 합니다.';
      accountMessage.className = 'account-message error';
      return;
    }

    try {
      await API.updateProfile({
        displayName: newUsername,
        bio: document.getElementById('acctBio').value.trim(),
        favoriteEra: document.getElementById('acctEra').value
      });

      // 세션 정보 업데이트
      user.username = newUsername;
      API.setCurrentUser(user);

      document.getElementById('accountUsername').textContent = newUsername;
      if (userMenuName) userMenuName.textContent = newUsername;

      accountMessage.textContent = '변경 사항이 저장되었습니다.';
      accountMessage.className = 'account-message success';
    } catch (err) {
      accountMessage.textContent = err.message;
      accountMessage.className = 'account-message error';
    }
  });

  // ── 비밀번호 변경 ──
  // 참고: 현재 backend에 비밀번호 변경 API가 없으므로 향후 추가 필요
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

    passwordMessage.textContent = '비밀번호 변경 기능은 준비 중입니다.';
    passwordMessage.className = 'account-message error';
  });

  // ── 하단 로그아웃 ──
  const acctLogoutBtn = document.getElementById('acctLogoutBtn');
  if (acctLogoutBtn) {
    acctLogoutBtn.addEventListener('click', async () => {
      await API.logout();
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

    deleteConfirmBtn.addEventListener('click', async () => {
      // 향후 DELETE /api/users/account API 연동
      await API.logout();
      window.location.href = '../../index.html';
    });
  }
});
