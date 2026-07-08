// Runs inside the Inline TODO Quick Add dialog. CSP-safe (no inline handlers).
// Draws an always-visible click-to-pick calendar into #itg-cal that stays in
// sync with the #itg-due date field. Rebuilds itself whenever the dialog's HTML
// is (re)set, so it survives Joplin reusing the same dialog across opens.
(function () {
	var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	var WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

	var view = null; // first day of the month currently shown
	var sel = null;  // currently selected date (or null)

	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
	function parseISO(s) {
		var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
		return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
	}
	function input() { return document.getElementById('itg-due'); }
	function calEl() { return document.getElementById('itg-cal'); }

	function setValue(d) {
		sel = d;
		var i = input();
		if (i) i.value = d ? fmt(d) : '';
		render();
	}

	function render() {
		var cal = calEl();
		if (!cal || !view) return;
		var today = new Date();
		cal.innerHTML = '';

		var header = document.createElement('div');
		header.className = 'itg-cal-header';
		var prev = document.createElement('button');
		prev.type = 'button'; prev.className = 'itg-nav'; prev.textContent = '‹';
		var title = document.createElement('span');
		title.className = 'itg-cal-title';
		title.textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
		var next = document.createElement('button');
		next.type = 'button'; next.className = 'itg-nav'; next.textContent = '›';
		prev.onclick = function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); render(); };
		next.onclick = function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); render(); };
		header.appendChild(prev); header.appendChild(title); header.appendChild(next);
		cal.appendChild(header);

		var wd = document.createElement('div');
		wd.className = 'itg-grid';
		WEEKDAYS.forEach(function (w) {
			var c = document.createElement('div'); c.className = 'itg-wd'; c.textContent = w; wd.appendChild(c);
		});
		cal.appendChild(wd);

		var grid = document.createElement('div');
		grid.className = 'itg-grid';
		var firstDay = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
		var days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
		for (var i = 0; i < firstDay; i++) {
			var e = document.createElement('div'); e.className = 'itg-day itg-empty'; grid.appendChild(e);
		}
		for (var day = 1; day <= days; day++) {
			var cell = document.createElement('button');
			cell.type = 'button'; cell.className = 'itg-day'; cell.textContent = String(day);
			var d = new Date(view.getFullYear(), view.getMonth(), day);
			if (fmt(d) === fmt(today)) cell.className += ' itg-today';
			if (sel && fmt(d) === fmt(sel)) cell.className += ' itg-selected';
			cell.onclick = (function (ds) {
				return function () { setValue(parseISO(ds)); };
			})(fmt(d));
			grid.appendChild(cell);
		}
		cal.appendChild(grid);

		var actions = document.createElement('div');
		actions.className = 'itg-actions';
		function q(label, fn) {
			var b = document.createElement('button');
			b.type = 'button'; b.className = 'itg-quick'; b.textContent = label; b.onclick = fn; return b;
		}
		actions.appendChild(q('Today', function () { var d = new Date(); view = new Date(d.getFullYear(), d.getMonth(), 1); setValue(d); }));
		actions.appendChild(q('Tomorrow', function () { var d = new Date(); d.setDate(d.getDate() + 1); view = new Date(d.getFullYear(), d.getMonth(), 1); setValue(d); }));
		actions.appendChild(q('+1 week', function () { var d = new Date(); d.setDate(d.getDate() + 7); view = new Date(d.getFullYear(), d.getMonth(), 1); setValue(d); }));
		actions.appendChild(q('Clear', function () { setValue(null); }));
		cal.appendChild(actions);
	}

	function initFromInput() {
		var i = input();
		sel = parseISO(i ? i.value : '');
		var base = sel || new Date();
		view = new Date(base.getFullYear(), base.getMonth(), 1);
	}

	// Build the calendar once per fresh dialog content.
	function ensureBuilt() {
		try {
			var cal = calEl();
			if (cal && cal.getAttribute('data-itg-built') !== '1') {
				cal.setAttribute('data-itg-built', '1');
				initFromInput();
				render();
				var i = input();
				if (i && i.getAttribute('data-itg-wired') !== '1') {
					i.setAttribute('data-itg-wired', '1');
					i.addEventListener('change', function () {
						sel = parseISO(i.value);
						if (sel) view = new Date(sel.getFullYear(), sel.getMonth(), 1);
						render();
					});
				}
			}
		} catch (e) { /* no-op */ }
	}

	ensureBuilt();
	try {
		var obs = new MutationObserver(function () { ensureBuilt(); });
		obs.observe(document.body, { childList: true, subtree: true });
	} catch (e) { /* no-op */ }
})();
