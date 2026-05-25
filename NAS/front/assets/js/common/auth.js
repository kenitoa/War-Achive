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

  function storageKey(name) {
    var id = state.user && state.user.id ? state.user.id : "guest";
    return "war-archive:" + id + ":" + name;
  }

  function readStore(name, fallback) {
    try {
      var raw = localStorage.getItem(storageKey(name));
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeStore(name, value) {
    localStorage.setItem(storageKey(name), JSON.stringify(value));
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
      '<a class="wa-auth-link" href="/my-archive">My Archive</a>' +
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
      '      <label for="waAuthEmail">이메일 또는 로그인 ID</label>' +
      '      <input id="waAuthEmail" name="email" type="email" autocomplete="email" required>' +
      '    </div>' +
      '    <div class="wa-auth-field">' +
      '      <label for="waAuthPassword">비밀번호</label>' +
      '      <input id="waAuthPassword" name="password" type="password" autocomplete="current-password" minlength="4" required>' +
      '    </div>' +
      '    <p class="wa-auth-message" id="waAuthMessage" aria-live="polite"></p>' +
      '    <button class="wa-auth-submit" type="submit">로그인</button>' +
      '  </form>' +
      '</div>';
    document.body.appendChild(wrap);
    bindModal(wrap);
    return wrap;
  }

  function setMessage(message, ok) {
    var el = qs("#waAuthMessage");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("is-ok", Boolean(ok));
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
      if (event.target === modal || event.target.matches("[data-wa-close-login]")) closeModal();
      if (event.target.matches("[data-wa-mode]")) setMode(event.target.dataset.waMode);
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
        renderMyArchive();
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
        renderMyArchive();
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
        renderMyArchive();
      });
  }

  function renderList(items) {
    if (!items.length) {
      return '<p class="wa-empty-text">아직 저장된 항목이 없습니다.</p>';
    }
    return items.map(function (item, index) {
      return (
        '<article class="wa-saved-item">' +
        '  <div>' +
        '    <a href="' + escapeHtml(item.url) + '" class="wa-saved-title">' + escapeHtml(item.title) + '</a>' +
        '    <p>' + escapeHtml(item.note || "메모 없음") + '</p>' +
        '  </div>' +
        '  <button class="wa-mini-btn" type="button" data-wa-remove-save="' + index + '">삭제</button>' +
        '</article>'
      );
    }).join("");
  }

  function renderMyArchive() {
    var root = qs("#myArchiveProfile") || qs("#mypageProfile");
    if (!root) return;

    if (!state.ready) {
      root.innerHTML = '<div class="wa-mypage-panel">사용자 정보를 확인하는 중입니다.</div>';
      return;
    }

    if (!state.user) {
      root.innerHTML =
        '<div class="wa-login-required">' +
        '  <h2>로그인이 필요합니다</h2>' +
        '  <p>War Archive 계정으로 로그인하면 개인 archive 화면을 사용할 수 있습니다.</p>' +
        '  <button class="wa-auth-btn" type="button" data-wa-open-login>Login</button>' +
        '</div>';
      return;
    }

    var saved = readStore("saved", []);
    var note = readStore("note", "");
    root.innerHTML =
      '<div class="wa-mypage-grid wa-myarchive-grid">' +
      '  <section class="wa-mypage-panel wa-profile-panel">' +
      '    <h2>계정 정보</h2>' +
      '    <dl class="wa-profile-list">' +
      '      <div class="wa-profile-row"><dt>이름</dt><dd>' + escapeHtml(state.user.name) + '</dd></div>' +
      '      <div class="wa-profile-row"><dt>이메일</dt><dd>' + escapeHtml(state.user.email) + '</dd></div>' +
      '      <div class="wa-profile-row"><dt>권한</dt><dd>' + escapeHtml(state.user.role || "user") + '</dd></div>' +
      '      <div class="wa-profile-row"><dt>가입일</dt><dd>' + escapeHtml(formatDate(state.user.createdAt)) + '</dd></div>' +
      '    </dl>' +
      '  </section>' +
      '  <section class="wa-mypage-panel wa-stats-panel">' +
      '    <h2>개인 활동</h2>' +
      '    <div class="wa-stat-strip">' +
      '      <div><strong>' + saved.length + '</strong><span>저장 자료</span></div>' +
      '      <div><strong>' + (note.trim() ? "1" : "0") + '</strong><span>개인 메모</span></div>' +
      '    </div>' +
      '  </section>' +
      '  <section class="wa-mypage-panel wa-save-panel">' +
      '    <h2>자료 저장</h2>' +
      '    <form class="wa-save-form" data-wa-save-form>' +
      '      <input name="title" placeholder="자료 제목" required>' +
      '      <input name="url" placeholder="자료 주소" value="' + escapeHtml(location.pathname + location.search) + '" required>' +
      '      <textarea name="note" placeholder="짧은 메모"></textarea>' +
      '      <button class="wa-auth-btn" type="submit">저장</button>' +
      '    </form>' +
      '    <div class="wa-saved-list">' + renderList(saved) + '</div>' +
      '  </section>' +
      '  <section class="wa-mypage-panel wa-note-panel">' +
      '    <h2>개인 메모</h2>' +
      '    <textarea class="wa-private-note" data-wa-private-note placeholder="조사 중인 주제, 확인할 자료, 개인 기록을 적어두세요.">' + escapeHtml(note) + '</textarea>' +
      '    <p class="wa-note-state" data-wa-note-state>브라우저에 자동 저장됩니다.</p>' +
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

    var remove = event.target.closest("[data-wa-remove-save]");
    if (remove && state.user) {
      var saved = readStore("saved", []);
      saved.splice(Number(remove.dataset.waRemoveSave), 1);
      writeStore("saved", saved);
      renderMyArchive();
    }
  });

  document.addEventListener("submit", function (event) {
    var form = event.target.closest("[data-wa-save-form]");
    if (!form || !state.user) return;
    event.preventDefault();
    var saved = readStore("saved", []);
    saved.unshift({
      title: form.title.value.trim(),
      url: form.url.value.trim(),
      note: form.note.value.trim(),
      createdAt: new Date().toISOString(),
    });
    writeStore("saved", saved.slice(0, 30));
    renderMyArchive();
  });

  document.addEventListener("input", function (event) {
    if (!event.target.matches("[data-wa-private-note]") || !state.user) return;
    writeStore("note", event.target.value);
    var stateText = qs("[data-wa-note-state]");
    if (stateText) stateText.textContent = "저장됨";
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
