// ── My Account Page ──

document.addEventListener('DOMContentLoaded', () => {
  const username = localStorage.getItem('username');
  const token = localStorage.getItem('accessToken');

  // 로그인 안 된 상태면 로그인 페이지로 리다이렉트
  if (!username || !token) {
    window.location.href = 'login.html';
    return;
  }

  // 프로필 정보 채우기
  const avatarLetter = document.getElementById('avatarLetter');
  const profileUsername = document.getElementById('profileUsername');
  const detailUsername = document.getElementById('detailUsername');

  if (avatarLetter) avatarLetter.textContent = username.charAt(0).toUpperCase();
  if (profileUsername) profileUsername.textContent = username;
  if (detailUsername) detailUsername.textContent = username;

  // 가입일 표시
  const profileJoined = document.getElementById('profileJoined');
  const registeredAt = localStorage.getItem('registeredAt');
  if (profileJoined && registeredAt) {
    const date = new Date(registeredAt);
    profileJoined.textContent = '가입일: ' + date.getFullYear() + '년 ' + (date.getMonth() + 1) + '월 ' + date.getDate() + '일';
  }

  // 로그아웃
  const logoutBtn = document.getElementById('profileLogoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('username');
      window.location.href = 'login.html';
    });
  }

  // 회원 탈퇴
  const deleteBtn = document.getElementById('deleteAccountBtn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      if (!confirm('정말로 회원 탈퇴하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
      try {
        await fetch('/api/auth/delete', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ username })
        });
      } catch {
        // 서버 연결 실패해도 로컬 데이터는 정리
      }
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('username');
      localStorage.removeItem('registeredAt');
      alert('회원 탈퇴가 완료되었습니다.');
      window.location.href = 'login.html';
    });
  }

  // 모바일 메뉴 토글
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });
  }
});
