// ── War Archive - Login Page JavaScript (API 연동) ──

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

  // ── 로그인 처리 (API) ──
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

    try {
      const user = await API.login(email, password);
      messageEl.textContent = '로그인 성공! 메인 페이지로 이동합니다.';
      messageEl.className = 'form-message success';

      setTimeout(() => {
        window.location.href = '../../index.html';
      }, 1000);
    } catch (err) {
      messageEl.textContent = err.message;
      messageEl.className = 'form-message error';
    }
  });

  // ── 회원가입 처리 (API) ──
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

    try {
      await API.register(username, email, password);
      messageEl.textContent = '회원가입 성공! 로그인 페이지로 이동합니다.';
      messageEl.className = 'form-message success';

      setTimeout(() => {
        showLoginBtn.click();
      }, 1500);
    } catch (err) {
      messageEl.textContent = err.message;
      messageEl.className = 'form-message error';
    }
  });

  // ── 이미 로그인된 경우 리다이렉트 ──
  if (API.isLoggedIn()) {
    window.location.href = '../../index.html';
  }
});
