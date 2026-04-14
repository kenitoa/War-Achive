// ── War Archive - Login Page JavaScript ──

document.addEventListener('DOMContentLoaded', () => {

  // ── Mobile Menu Toggle ──
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        menuToggle.classList.remove('active');
      });
    });
  }

  // ── Elements ──
  const loginForm = document.getElementById('loginForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const confirmPasswordGroup = document.getElementById('confirmPasswordGroup');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const formError = document.getElementById('formError');
  const submitBtn = document.getElementById('submitBtn');
  const toggleMode = document.getElementById('toggleMode');
  const toggleQuestion = document.getElementById('toggleQuestion');
  const formSubtitle = document.getElementById('formSubtitle');
  const togglePassword = document.getElementById('togglePassword');
  const eyeIcon = document.getElementById('eyeIcon');

  let isLoginMode = true;

  // ── Toggle Password Visibility ──
  if (togglePassword) {
    togglePassword.addEventListener('click', () => {
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      eyeIcon.textContent = isPassword ? '\u{1F441}\u{FE0F}\u{200D}\u{1F5E8}\u{FE0F}' : '\u{1F441}';
    });
  }

  // ── Toggle Login / Register Mode ──
  if (toggleMode) {
    toggleMode.addEventListener('click', () => {
      isLoginMode = !isLoginMode;
      formError.textContent = '';

      if (isLoginMode) {
        confirmPasswordGroup.style.display = 'none';
        confirmPasswordInput.removeAttribute('required');
        submitBtn.textContent = '로그인';
        toggleQuestion.textContent = '계정이 없으신가요?';
        toggleMode.textContent = '회원가입';
        formSubtitle.textContent = '계정에 로그인하세요';
      } else {
        confirmPasswordGroup.style.display = '';
        confirmPasswordInput.setAttribute('required', '');
        submitBtn.textContent = '회원가입';
        toggleQuestion.textContent = '이미 계정이 있으신가요?';
        toggleMode.textContent = '로그인';
        formSubtitle.textContent = '새 계정을 만드세요';
      }
    });
  }

  // ── Form Submit ──
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.textContent = '';

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      formError.textContent = '사용자명과 비밀번호를 입력해주세요.';
      return;
    }

    if (!isLoginMode) {
      const confirmPassword = confirmPasswordInput.value;
      if (password !== confirmPassword) {
        formError.textContent = '비밀번호가 일치하지 않습니다.';
        return;
      }
      if (password.length < 8) {
        formError.textContent = '비밀번호는 8자 이상이어야 합니다.';
        return;
      }
    }

    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    try {
      const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      let data;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } else {
        data = {};
      }

      if (!response.ok) {
        const errorMsg = data.message
          || data.error
          || (data.errors && data.errors.map(e => e.msg).join(', '))
          || (isLoginMode ? '로그인에 실패했습니다.' : '회원가입에 실패했습니다.');
        throw new Error(errorMsg);
      }

      if (isLoginMode) {
        // 로그인 성공: 토큰 저장
        if (data.accessToken) {
          localStorage.setItem('accessToken', data.accessToken);
        }
        if (data.refreshToken) {
          localStorage.setItem('refreshToken', data.refreshToken);
        }

        document.querySelector('.login-card').classList.add('success');
        submitBtn.textContent = '로그인 성공!';

        setTimeout(() => {
          window.location.href = '../main.html';
        }, 800);
      } else {
        // 회원가입 성공: 가입일 저장
        localStorage.setItem('registeredAt', new Date().toISOString());

        // 로그인 모드로 전환
        formError.style.color = 'var(--success)';
        formError.textContent = '회원가입 성공! 로그인해주세요.';

        // 로그인 모드로 전환
        isLoginMode = true;
        confirmPasswordGroup.style.display = 'none';
        confirmPasswordInput.removeAttribute('required');
        submitBtn.textContent = '로그인';
        toggleQuestion.textContent = '계정이 없으신가요?';
        toggleMode.textContent = '회원가입';
        formSubtitle.textContent = '계정에 로그인하세요';

        setTimeout(() => {
          formError.style.color = '';
        }, 3000);
      }
    } catch (err) {
      formError.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  });
});
