// ── War Archive - Common JS ──
// 모든 페이지에서 공유하는 공통 기능

(function () {
  'use strict';

  // ── 뒤로가기 네비게이션 ──
  document.addEventListener('click', function (e) {
    var backBtn = e.target.closest('[data-action="back"]');
    if (backBtn) {
      e.preventDefault();
      window.history.back();
    }
  });

  // ── URL 파라미터 헬퍼 ──
  window.getParam = function (name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  };

  // ── 데이터 fetcher (공통) ──
  window.fetchData = function (url) {
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  };
})();
