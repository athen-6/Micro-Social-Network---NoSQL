(() => {
	const backendPorts = ["3000", "3001", "3002"];
	const isBackendOrigin = window.location.hostname === "localhost" && backendPorts.includes(window.location.port);
	const API_BASE = "/api"; /*window.__API_BASE__ || (isBackendOrigin ? `${window.location.origin}/api` : "http://localhost:3000/api")*/;
	const USER_KEY = "miniSocialCurrentUser";

	async function request(endpoint, options = {}) {
		const apiBases = [API_BASE];
		if (API_BASE === "http://localhost:3000/api") apiBases.push("http://localhost:3002/api");
		let lastError = "Không kết nối được backend";

		for (const base of apiBases) {
			let response;
			try {
				response = await fetch(`${base}${endpoint}`, {
					headers: { "Content-Type": "application/json", ...(options.headers || {}) },
					...options
				});
			} catch (error) {
				lastError = "Không kết nối được backend";
				continue;
			}

			const rawBody = await response.text();
			let payload = null;
			try { payload = rawBody ? JSON.parse(rawBody) : null; } catch (error) { lastError = `Backend trả về dữ liệu không hợp lệ (HTTP ${response.status})`; continue; }
			if (response.status === 404 && base !== apiBases[apiBases.length - 1]) { continue; }
			if (!response.ok || !payload?.success) throw new Error(payload?.message || `Backend không xử lý được yêu cầu (HTTP ${response.status})`);
			return payload;
		}

		throw new Error(`${lastError}. Hãy chạy backend bằng npm.cmd start.`);
	}

	function getCurrentUser() {
		try { return JSON.parse(localStorage.getItem(USER_KEY)) || null; } catch (error) { return null; }
	}

	function setCurrentUser(user) {
		localStorage.setItem(USER_KEY, JSON.stringify(user));
		document.body.classList.remove("auth-locked");
		window.location.reload();
	}

	function lockApp() {
		document.body.classList.add("auth-locked");
	}

	function logout() {
		localStorage.removeItem(USER_KEY);
		window.location.href = "index.html";
	}

	function escapeHtml(value = "") {
		return String(value).replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
	}

	function avatarMarkup(user, className = "avatar") {
		const letter = (user?.fullName || user?.username || "U").charAt(0).toUpperCase();
		const userAttribute = user?.id ? ` data-user-id="${escapeHtml(user.id)}"` : "";
		return user?.avatarUrl ? `<img class="${className}"${userAttribute} src="${escapeHtml(mediaUrl(user.avatarUrl))}" alt="avatar">` : `<span class="${className}"${userAttribute}>${escapeHtml(letter)}</span>`;
	}

	function mediaUrl(url = "") {
		if (!url.startsWith("/Images/") && !url.startsWith("/Videos/")) return url;
		const isLiveServer = window.location.port === "5500" || window.location.port === "5501";
		return isLiveServer ? `${window.location.origin}/frontend${url}` : url;
	}

	function formatDate(value) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

	function toast(message) {
		let element = document.getElementById("mini-social-toast");
		if (!element) { element = document.createElement("div"); element.id = "mini-social-toast"; document.body.appendChild(element); }
		element.textContent = message;
		clearTimeout(element.timer);
		element.timer = setTimeout(() => element.remove(), 2600);
	}

	function renderLoginModal() {
		if (document.querySelector(".auth-modal")) return;
		lockApp();
		const modal = document.createElement("div");
		modal.className = "login-modal auth-modal";
		modal.innerHTML = `<div class="login-card auth-card"><div class="auth-brand"><span class="auth-brand-mark">M</span><div><h3>MiniSocial</h3><p>Kết nối, chia sẻ và lưu giữ khoảnh khắc.</p></div><button class="close-auth" type="button">×</button></div><div class="auth-tabs"><button class="auth-tab active" data-mode="login">Đăng nhập</button><button class="auth-tab" data-mode="register">Đăng ký</button></div><form id="authForm"><input name="username" placeholder="Tên đăng nhập" autocomplete="username" required><input name="fullName" placeholder="Họ và tên" class="register-field" autocomplete="name" hidden><input name="password" type="password" placeholder="Mật khẩu" autocomplete="current-password" required minlength="6"><input name="avatarUrl" type="hidden" value="/Images/duyen.jpg"><button class="primary-btn auth-submit" type="submit">Đăng nhập</button><p class="auth-message"></p></form></div>`;
		document.body.appendChild(modal);
		let mode = "login";
		const form = modal.querySelector("form");
		const fullName = modal.querySelector(".register-field");
		const registerFields = modal.querySelectorAll(".register-field");
		const submit = form.querySelector("button[type=submit]");
		modal.querySelectorAll(".auth-tab").forEach(tab => tab.addEventListener("click", () => { mode = tab.dataset.mode; modal.querySelectorAll(".auth-tab").forEach(item => item.classList.toggle("active", item === tab)); registerFields.forEach(field => { field.hidden = mode !== "register"; }); fullName.required = mode === "register"; submit.textContent = mode === "register" ? "Tạo tài khoản" : "Đăng nhập"; }));
		modal.querySelector(".close-auth").addEventListener("click", () => { modal.remove(); lockApp(); });
		form.addEventListener("submit", async event => { event.preventDefault(); const body = Object.fromEntries(new FormData(form)); const message = modal.querySelector(".auth-message"); try { const result = await request(mode === "login" ? "/auth/login" : "/auth/register", { method: "POST", body: JSON.stringify(body) }); setCurrentUser(result.data.user); } catch (error) { message.textContent = error.message; } });
	}

	function addAccountMenu() {
		const user = getCurrentUser();
		if (!user) return;
		document.querySelectorAll(".user-mini").forEach(element => {
			element.classList.add("account-menu");
			element.innerHTML = `<button class="account-trigger" type="button">${avatarMarkup(user, "avatar avatar-sm")}<b>${escapeHtml(user.fullName)}</b><span class="account-chevron">⌄</span></button><div class="user-dropdown" hidden><div class="dropdown-user"><b>${escapeHtml(user.fullName)}</b><small>${escapeHtml(user.username)}</small></div><button class="logout-btn" type="button">Đăng xuất</button></div>`;
			const trigger = element.querySelector(".account-trigger");
			const dropdown = element.querySelector(".user-dropdown");
			trigger.addEventListener("click", event => { event.stopPropagation(); document.querySelectorAll(".user-dropdown").forEach(menu => { if (menu !== dropdown) menu.hidden = true; }); dropdown.hidden = !dropdown.hidden; });
			element.querySelector(".logout-btn").addEventListener("click", logout);
		});
		document.addEventListener("click", () => document.querySelectorAll(".user-dropdown").forEach(menu => { menu.hidden = true; }), { once: true });
	}

	window.socialApi = { API_BASE, request, getCurrentUser, setCurrentUser, logout, renderLoginModal, addAccountMenu, avatarMarkup, mediaUrl, escapeHtml, formatDate, toast };
	document.addEventListener("DOMContentLoaded", () => { if (!getCurrentUser()) { lockApp(); renderLoginModal(); } else { document.body.classList.remove("auth-locked"); addAccountMenu(); } });
})();
