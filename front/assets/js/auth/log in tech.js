// ── War Archive - Login Page JavaScript ──

document.addEventListener('DOMContentLoaded', () => {

  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const showSignupBtn = document.getElementById('showSignup');
  const showLoginBtn = document.getElementById('showLogin');
  const loginHeader = document.querySelector('.login-header');
  const loginDivider = document.querySelector('.login-divider');
  const signupSection = document.querySelector('.signup-section');

  // ── 로그인 / 회원가입 전환 ──
  showSignupBtn.addEventListener('click', () => {
    loginForm.style.display = 'none';
    loginHeader.style.display = 'none';
    loginDivider.style.display = 'none';
    signupSection.style.display = 'none';
    signupForm.style.display = 'flex';
  });

  showLoginBtn.addEventListener('click', () => {
    signupForm.style.display = 'none';
    loginForm.style.display = 'flex';
    loginHeader.style.display = 'block';
    loginDivider.style.display = 'flex';
    signupSection.style.display = 'block';
    clearMessages();
  });

  // ── 비밀번호 표시/숨기기 토글 ──
  document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.parentElement.querySelector('input');
      if (input.type === 'password') {
        input.type = 'text';
        btn.querySelector('.eye-icon').textContent = '🔒';
      } else {
        input.type = 'password';
        btn.querySelector('.eye-icon').textContent = '👁';
      }
    });
  });

  // ── 유효성 검사 헬퍼 ──
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function clearMessages() {
    document.querySelectorAll('.form-error').forEach(el => el.textContent = '');
    document.querySelectorAll('.form-message').forEach(el => {
      el.textContent = '';
      el.className = 'form-message';
    });
  }

  // ── 비밀번호 해싱 (SHA-256) ──
  async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ── 사용자 데이터 저장소 (localStorage 기반) ──
  // 참고: 프로덕션에서는 서버 측 SQL DB를 사용해야 합니다.
  // 이 구현은 프론트엔드 데모용으로 localStorage를 사용합니다.
  function getUsers() {
    const data = localStorage.getItem('warArchiveUsers');
    return data ? JSON.parse(data) : [];
  }

  function saveUsers(users) {
    localStorage.setItem('warArchiveUsers', JSON.stringify(users));
  }

  // ── 초기 관리자 계정 등록 (localStorage에 없으면 자동 추가) ──
  (function initAdminAccount() {
    const users = getUsers();
    const adminEmail = 'kiseno@gmail.com';
    if (!users.find(u => u.email === adminEmail)) {
      users.push({
        id: 0,
        username: 'kiseno',
        email: adminEmail,
        passwordHash: '45211ab59b6cede2827784ee64e4d3c81f1cceb6dbcd88b7db93cced77241a20',
        role: 'admin',
        createdAt: '2026-04-14T00:00:00.000Z'
      });
      saveUsers(users);
    }
  })();

  function findUserByEmail(email) {
    const users = getUsers();
    return users.find(u => u.email === email.toLowerCase().trim());
  }

  // ── 현재 로그인 세션 ──
  function setCurrentUser(user) {
    const sessionUser = {
      username: user.username,
      email: user.email,
      loginTime: new Date().toISOString()
    };
    sessionStorage.setItem('warArchiveCurrentUser', JSON.stringify(sessionUser));
  }

  function getCurrentUser() {
    const data = sessionStorage.getItem('warArchiveCurrentUser');
    return data ? JSON.parse(data) : null;
  }

  // ── 로그인 처리 ──
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();

    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const messageEl = document.getElementById('formMessage');
    let valid = true;

    if (!email) {
      document.getElementById('emailError').textContent = '이메일을 입력해주세요.';
      valid = false;
    } else if (!isValidEmail(email)) {
      document.getElementById('emailError').textContent = '유효한 이메일 형식을 입력해주세요.';
      valid = false;
    }

    if (!password) {
      document.getElementById('passwordError').textContent = '비밀번호를 입력해주세요.';
      valid = false;
    }

    if (!valid) return;

    const user = findUserByEmail(email);
    const hashedPassword = await hashPassword(password);

    if (!user || user.passwordHash !== hashedPassword) {
      messageEl.textContent = '이메일 또는 비밀번호가 올바르지 않습니다.';
      messageEl.className = 'form-message error';
      return;
    }

    setCurrentUser(user);
    messageEl.textContent = '로그인 성공! 메인 페이지로 이동합니다.';
    messageEl.className = 'form-message success';

    setTimeout(() => {
      window.location.href = '../../index.html';
    }, 1000);
  });

  // ── 회원가입 처리 ──
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();

    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    const messageEl = document.getElementById('signupMessage');
    let valid = true;

    if (!username || username.length < 2) {
      document.getElementById('usernameError').textContent = '사용자 이름은 2자 이상이어야 합니다.';
      valid = false;
    }

    if (!email) {
      document.getElementById('signupEmailError').textContent = '이메일을 입력해주세요.';
      valid = false;
    } else if (!isValidEmail(email)) {
      document.getElementById('signupEmailError').textContent = '유효한 이메일 형식을 입력해주세요.';
      valid = false;
    }

    if (!password || password.length < 8) {
      document.getElementById('signupPasswordError').textContent = '비밀번호는 8자 이상이어야 합니다.';
      valid = false;
    }

    if (password !== passwordConfirm) {
      document.getElementById('confirmError').textContent = '비밀번호가 일치하지 않습니다.';
      valid = false;
    }

    if (!valid) return;

    // 중복 이메일 확인
    if (findUserByEmail(email)) {
      document.getElementById('signupEmailError').textContent = '이미 등록된 이메일입니다.';
      return;
    }

    // 새 사용자 등록
    const hashedPassword = await hashPassword(password);
    const users = getUsers();
    const newUser = {
      id: users.length + 1,
      username: username,
      email: email.toLowerCase(),
      passwordHash: hashedPassword,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);

    messageEl.textContent = '회원가입 성공! 로그인 페이지로 이동합니다.';
    messageEl.className = 'form-message success';

    setTimeout(() => {
      showLoginBtn.click();
    }, 1500);
  });

  // ── 이미 로그인된 경우 리다이렉트 ──
  const currentUser = getCurrentUser();
  if (currentUser) {
    window.location.href = '../../index.html';
  }
});
