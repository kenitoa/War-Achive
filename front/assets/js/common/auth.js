(function () {
  var state = {
    user: null,
    ready: false,
  };

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(value) {
    if (!value) return "-";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    options.credentials = "same-origin";
    return fetch(path, options).then(function (response) {
      return response.json().catch(function () {
        return { ok: false, error: "응답을 읽지 못했습니다." };
      }).then(function (payload) {
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "요청을 처리하지 못했습니다.");
        }
        return payload;
      });
    });
  }

  function ensureAuthActions() {
    var host = qs(".nav-links") || qs(".header-inner") || qs(".site-header") || document.body;
    var existing = qs(".wa-auth-actions", host);
    if (existing) return existing;

    var actions = document.createElement("div");
    actions.className = "wa-auth-actions";
    host.appendChild(actions);
    return actions;
  }

  function renderAuthActions() {
    var actions = ensureAuthActions();
    if (!state.ready) {
      actions.innerHTML = '<span class="wa-auth-user">확인 중...</span>';
      return;
    }

    if (!state.user) {
      actions.innerHTML = '<button class="wa-auth-btn" type="button" data-wa-open-login>Login</button>';
      return;
    }

    actions.innerHTML =
      '<span class="wa-auth-user" title="' + escapeHtml(state.user.email) + '">' + escapeHtml(state.user.name) + '</span>' +
      '<a class="wa-auth-link" href="/mypage">Mypage</a>' +
      '<button class="wa-auth-btn is-quiet" type="button" data-wa-logout>Logout</button>';
  }

  function ensureModal() {
    var existing = qs("#waAuthBackdrop");
    if (existing) return existing;

    var wrap = document.createElement("div");
    wrap.className = "wa-auth-backdrop";
    wrap.id = "waAuthBackdrop";
    wrap.innerHTML =
      '<div class="wa-auth-modal" role="dialog" aria-modal="true" aria-labelledby="waAuthTitle">' +
      '  <div class="wa-auth-modal-head">' +
      '    <h2 class="wa-auth-title" id="waAuthTitle">War Archive 로그인</h2>' +
      '    <button class="wa-auth-close" type="button" aria-label="닫기" data-wa-close-login>&times;</button>' +
      '  </div>' +
      '  <div class="wa-auth-tabs" role="tablist">' +
      '    <button class="wa-auth-tab is-active" type="button" data-wa-mode="login">로그인</button>' +
      '    <button class="wa-auth-tab" type="button" data-wa-mode="register">회원가입</button>' +
      '  </div>' +
      '  <form class="wa-auth-form" id="waAuthForm">' +
      '    <div class="wa-auth-field" data-wa-name-field hidden>' +
      '      <label for="waAuthName">이름</label>' +
      '      <input id="waAuthName" name="name" autocomplete="name" maxlength="80">' +
      '    </div>' +
      '    <div class="wa-auth-field">' +
      '      <label for="waAuthEmail">이메일</label>' +
      '      <input id="waAuthEmail" name="email" type="email" autocomplete="email" required>' +
      '    </div>' +
      '    <div class="wa-auth-field">' +
      '      <label for="waAuthPassword">비밀번호</label>' +
      '      <input id="waAuthPassword" name="password" type="password" autocomplete="current-password" minlength="8" required>' +
      '    </div>' +
      '    <p class="wa-auth-message" id="waAuthMessage" aria-live="polite"></p>' +
      '    <button class="wa-auth-submit" type="submit">로그인</button>' +
      '  </form>' +
      '</div>';
    document.body.appendChild(wrap);
    bindModal(wrap);
    return wrap;
  }

  function setMode(mode) {
    var modal = ensureModal();
    var isRegister = mode === "register";
    modal.dataset.mode = mode;
    modal.querySelectorAll("[data-wa-mode]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.waMode === mode);
    });
    qs("[data-wa-name-field]", modal).hidden = !isRegister;
    qs(".wa-auth-submit", modal).textContent = isRegister ? "회원가입" : "로그인";
    qs("#waAuthPassword", modal).setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
    setMessage("");
  }

  function setMessage(message, ok) {
    var el = qs("#waAuthMessage");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-ok", Boolean(ok));
  }

  function openModal(mode) {
    var modal = ensureModal();
    setMode(mode || "login");
    modal.classList.add("is-open");
    setTimeout(function () {
      var input = qs(modal.dataset.mode === "register" ? "#waAuthName" : "#waAuthEmail", modal);
      if (input) input.focus();
    }, 0);
  }

  function closeModal() {
    var modal = qs("#waAuthBackdrop");
    if (modal) modal.classList.remove("is-open");
  }

  function bindModal(modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal || event.target.matches("[data-wa-close-login]")) {
        closeModal();
      }
      if (event.target.matches("[data-wa-mode]")) {
        setMode(event.target.dataset.waMode);
      }
    });

    qs("#waAuthForm", modal).addEventListener("submit", function (event) {
      event.preventDefault();
      var form = event.currentTarget;
      var mode = modal.dataset.mode || "login";
      var submit = qs(".wa-auth-submit", form);
      var payload = {
        email: form.email.value.trim(),
        password: form.password.value,
      };
      if (mode === "register") payload.name = form.name.value.trim();

      submit.disabled = true;
      setMessage("처리 중입니다.");
      api(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      }).then(function (result) {
        state.user = result.user;
        state.ready = true;
        renderAuthActions();
        renderMypage();
        setMessage("로그인되었습니다.", true);
        setTimeout(closeModal, 250);
      }).catch(function (error) {
        setMessage(error.message);
      }).finally(function () {
        submit.disabled = false;
      });
    });
  }

  function loadMe() {
    state.ready = false;
    renderAuthActions();
    return api("/api/auth/me", { method: "GET" })
      .then(function (result) {
        state.user = result.user;
      })
      .catch(function () {
        state.user = null;
      })
      .finally(function () {
        state.ready = true;
        renderAuthActions();
        renderMypage();
      });
  }

  function logout() {
    api("/api/auth/logout", { method: "POST", body: "{}" })
      .catch(function () {
        return null;
      })
      .finally(function () {
        state.user = null;
        state.ready = true;
        renderAuthActions();
        renderMypage();
      });
  }

  function renderMypage() {
    var root = qs("#mypageProfile");
    if (!root) return;

    if (!state.ready) {
      root.innerHTML = '<div class="wa-mypage-panel">사용자 정보를 확인하는 중입니다.</div>';
      return;
    }

    if (!state.user) {
      root.innerHTML =
        '<div class="wa-login-required">' +
        '  <h2>로그인이 필요합니다</h2>' +
        '  <p>War Archive 계정으로 로그인하면 개인 페이지를 사용할 수 있습니다.</p>' +
        '  <button class="wa-auth-btn" type="button" data-wa-open-login>Login</button>' +
        '</div>';
      return;
    }

    root.innerHTML =
      '<div class="wa-mypage-grid">' +
      '  <section class="wa-mypage-panel">' +
      '    <h2>계정 정보</h2>' +
      '    <dl class="wa-profile-list">' +
      '      <div class="wa-profile-row"><dt>이름</dt><dd>' + escapeHtml(state.user.name) + '</dd></div>' +
      '      <div class="wa-profile-row"><dt>이메일</dt><dd>' + escapeHtml(state.user.email) + '</dd></div>' +
      '      <div class="wa-profile-row"><dt>가입일</dt><dd>' + escapeHtml(formatDate(state.user.createdAt)) + '</dd></div>' +
      '    </dl>' +
      '  </section>' +
      '  <section class="wa-mypage-panel">' +
      '    <h2>기본 메뉴</h2>' +
      '    <div class="wa-mypage-placeholder">' +
      '      <p>저장한 자료, 열람 기록, 기여 내역을 이 영역에 확장할 수 있습니다.</p>' +
      '      <p>현재는 로그인 상태와 계정 정보를 확인하는 기본 형태만 제공합니다.</p>' +
      '    </div>' +
      '  </section>' +
      '</div>';
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-wa-open-login]")) {
      event.preventDefault();
      openModal("login");
    }
    if (event.target.closest("[data-wa-logout]")) {
      event.preventDefault();
      logout();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeModal();
  });

  window.WarArchiveAuth = {
    open: openModal,
    close: closeModal,
    reload: loadMe,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadMe);
  } else {
    loadMe();
  }
})();
