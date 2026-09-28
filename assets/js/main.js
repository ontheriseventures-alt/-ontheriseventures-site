document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('open');
      var expanded = nav.classList.contains('open');
      toggle.setAttribute('aria-expanded', expanded);
    });
  }

  var mailForms = document.querySelectorAll('form[data-mailto]');
  mailForms.forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var to = form.getAttribute('data-mailto');
      var subject = form.getAttribute('data-subject') || 'Website inquiry';
      var lines = [];
      form.querySelectorAll('[data-label]').forEach(function (field) {
        var label = field.getAttribute('data-label');
        var value = field.value.trim();
        if (value) lines.push(label + ': ' + value);
      });
      var body = lines.join('\n');
      var url = 'mailto:' + encodeURIComponent(to) +
        '?subject=' + encodeURIComponent(subject) +
        '&body=' + encodeURIComponent(body);
      window.location.href = url;
    });
  });
});
