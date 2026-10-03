document.addEventListener("DOMContentLoaded", () => {
	const api = window.socialApi;
	const user = api.getCurrentUser();
	const feed = document.getElementById("feed");
	const input = document.getElementById("postInput");
	const mediaInput = document.getElementById("feedImageInput");
	const globalSearch = document.getElementById("globalSearch");
	const globalSearchResults = document.getElementById("globalSearchResults");
	let imageUrl = "";
	let videoUrl = "";
	if (!user || !feed) return;
	let allUsers = [];
	api.request("/users").then(result => { allUsers = result.data.users; }).catch(() => {});
	globalSearch?.addEventListener("input", () => {
		const query = globalSearch.value.trim().toLowerCase();
		if (!query) { globalSearchResults.hidden = true; globalSearchResults.innerHTML = ""; return; }
		const matches = allUsers.filter(item => `${item.fullName} ${item.username}`.toLowerCase().includes(query)).slice(0, 8);
		globalSearchResults.innerHTML = matches.length ? matches.map(item => `<a class="global-search-result" href="profile.html?userId=${encodeURIComponent(item.id)}">${api.avatarMarkup(item, "avatar avatar-sm")}<span><b>${api.escapeHtml(item.fullName)}</b><small>@${api.escapeHtml(item.username)}</small></span></a>`).join("") : "<small>Không tìm thấy người dùng.</small>";
		globalSearchResults.hidden = false;
	});
	document.addEventListener("click", event => { if (!event.target.closest(".search-mini") && globalSearchResults) globalSearchResults.hidden = true; });

	const renderPost = post => `<article class="card post" data-post-id="${api.escapeHtml(post.id)}"><div class="post-head">${api.avatarMarkup(post.author)}<div><b>${api.escapeHtml(post.author.fullName)}</b><small>${api.escapeHtml(post.author.username)} · ${api.formatDate(post.createdAt)}</small></div>${post.author.id === user.id ? `<div class="post-menu-wrap"><button type="button" class="dots" aria-label="Tùy chọn bài viết">...</button><div class="post-menu"><button type="button" class="delete-post-btn">Xóa bài</button></div></div>` : ""}</div><p>${api.escapeHtml(post.content)}</p>${post.imageUrl ? `<div class="post-image-box"><img src="${api.escapeHtml(api.mediaUrl(post.imageUrl))}" alt="Ảnh bài viết"></div>` : ""}${!post.imageUrl && post.videoUrl ? `<div class="post-image-box"><video src="${api.escapeHtml(api.mediaUrl(post.videoUrl))}" controls></video></div>` : ""}<div class="post-stats"><button type="button" class="interaction-link" data-interaction="likes">${post.stats.likeCount} lượt thích</button><button type="button" class="interaction-link" data-interaction="comments">${post.stats.commentCount} bình luận</button><button type="button" class="interaction-link" data-interaction="shares">${post.stats.shareCount || 0} chia sẻ</button></div><div class="post-actions"><button type="button" class="like-btn ${post.userInteraction.isLiked ? "active" : ""}" data-liked="${post.userInteraction.isLiked}">${post.userInteraction.isLiked ? "♥" : "♡"} Thích</button><button type="button" class="comment-btn">▢ Bình luận</button><button type="button" class="share-btn">↗ Chia sẻ</button></div><div class="comment-box"><input placeholder="Viết bình luận..."><button type="button" class="send-comment">Gửi</button></div><div class="interaction-details" hidden></div></article>`;

	async function loadFeed() {
		try { const result = await api.request(`/posts?userId=${user.id}`); feed.innerHTML = result.data.posts.map(renderPost).join(""); } catch (error) { feed.innerHTML = `<div class="card post">${api.escapeHtml(error.message)}</div>`; }
	}

	function openShareDialog(postId) {
		const modal = document.createElement("div");
		modal.className = "login-modal share-modal";
		modal.innerHTML = `<div class="login-card"><button class="close-auth" type="button">×</button><h3>Chia sẻ bài viết</h3><p>Chia sẻ đến bạn bè</p><div class="share-friends">Đang tải danh sách bạn bè...</div></div>`;
		document.body.appendChild(modal);
		const friends = modal.querySelector(".share-friends");
		api.request(`/friends?userId=${user.id}`).then(result => {
			if (!result.data.friends.length) { friends.textContent = "Bạn chưa có bạn bè để chia sẻ."; return; }
			friends.innerHTML = result.data.friends.map(friend => `<button type="button" class="share-friend" data-recipient-id="${api.escapeHtml(friend.id)}">${api.avatarMarkup(friend, "avatar avatar-sm")}<span><b>${api.escapeHtml(friend.fullName)}</b><small>@${api.escapeHtml(friend.username)}</small></span></button>`).join("");
		}).catch(error => { friends.textContent = error.message; });
		modal.querySelector(".close-auth").addEventListener("click", () => modal.remove());
		friends.addEventListener("click", async event => {
			const friend = event.target.closest(".share-friend");
			if (!friend) return;
			try { await api.request(`/posts/${postId}/share`, { method: "POST", body: JSON.stringify({ userId: user.id, recipientId: friend.dataset.recipientId }) }); modal.remove(); await loadFeed(); api.toast("Đã chia sẻ bài viết"); } catch (error) { api.toast(error.message); }
		});
	}

	document.getElementById("postBtn")?.addEventListener("click", () => { sessionStorage.setItem("miniSocialDraft", input.value.trim()); window.location.href = "create-post.html"; });
	document.getElementById("feedImageButton")?.addEventListener("click", () => mediaInput.click());
	mediaInput?.addEventListener("change", event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { if (file.type.startsWith("video/")) { videoUrl = reader.result; imageUrl = ""; } else { imageUrl = reader.result; videoUrl = ""; } api.toast("Đã chọn một tệp media"); }; reader.readAsDataURL(file); });
	document.getElementById("feedEmojiButton")?.addEventListener("click", () => { const list = document.getElementById("feedEmojiList"); list.style.display = list.style.display === "flex" ? "none" : "flex"; });
	document.getElementById("feedEmojiList")?.addEventListener("click", event => { if (event.target.tagName === "BUTTON") input.value += event.target.textContent; });
	async function showInteractions(article, type) {
		const panel = article.querySelector(".interaction-details");
		if (!panel.hidden && panel.dataset.type === type) { panel.hidden = true; return; }
		try {
			const result = await api.request(`/posts/${article.dataset.postId}/interactions`);
			const items = result.data[type] || [];
			panel.dataset.type = type;
			if (type === "comments") panel.innerHTML = items.length ? items.map(item => `<div class="comment-item"><b>${api.escapeHtml(item.user.fullName)}</b><span>${api.escapeHtml(item.content)}</span><small>${item.createdAt ? api.formatDate(item.createdAt) : ""}</small></div>`).join("") : "<small>Chưa có bình luận nào.</small>";
			else {
				const label = type === "likes" ? "lượt thích" : "lượt chia sẻ";
				if (!items.length) panel.innerHTML = `<small>Chưa có ${label} nào.</small>`;
				else if (type === "likes") panel.innerHTML = `<div class="interaction-people likes-dropdown"><b>Người đã thích:</b><div class="interaction-avatar-list">${items.map(item => `<div class="interaction-person">${api.avatarMarkup(item.user, "avatar avatar-sm")}<span><b>${api.escapeHtml(item.user.fullName)}</b><small>${api.escapeHtml(item.user.username)}</small></span></div>`).join("")}</div></div>`;
				else panel.innerHTML = `<div class="interaction-people"><b>Người ${label}:</b> ${items.map(item => api.escapeHtml(item.user.fullName)).join(", ")}</div>`;
			}
			panel.hidden = false;
		} catch (error) { api.toast(error.message); }
	}

	function updateLikeUI(article, result) {
		const button = article.querySelector(".like-btn");
		const count = article.querySelector('[data-interaction="likes"]');
		button.dataset.liked = String(result.data.isLiked);
		button.classList.toggle("active", result.data.isLiked);
		button.innerHTML = `${result.data.isLiked ? "♥" : "♡"} Thích`;
		count.textContent = `${result.data.newLikeCount} lượt thích`;
	}
	feed.addEventListener("click", async event => {
		const clickedAvatar = event.target.closest(".avatar[data-user-id]");
		if (clickedAvatar) { window.location.href = `profile.html?userId=${encodeURIComponent(clickedAvatar.dataset.userId)}`; return; }
		const article = event.target.closest("[data-post-id]"); if (!article) return;
		const postId = article.dataset.postId;
		try {
			if (event.target.closest(".dots")) {
				event.stopPropagation();
				article.querySelector(".post-menu")?.classList.toggle("show");
				return;
			}
			if (event.target.closest(".delete-post-btn")) {
				if (!window.confirm("Bạn có chắc muốn xóa bài viết này không?")) return;
				await api.request(`/posts/${postId}`, { method: "DELETE", body: JSON.stringify({ userId: user.id }) });
				article.remove();
				api.toast("Đã xóa bài viết");
				return;
			}
			const interaction = event.target.closest("[data-interaction]");
			if (interaction) { await showInteractions(article, interaction.dataset.interaction); return; }
			if (event.target.closest(".like-btn")) {
				event.preventDefault();
				event.stopPropagation();
				const button = event.target.closest(".like-btn");
				const scrollRoot = document.scrollingElement || document.documentElement;
				const scrollPosition = scrollRoot.scrollTop;
				const result = await api.request(`/posts/${postId}/like`, {
					method: "POST",
					body: JSON.stringify({
						userId: user.id,
						action: button.dataset.liked === "true" ? "UNLIKE" : "LIKE"
					})
				});
				updateLikeUI(article, result);
				scrollRoot.scrollTop = scrollPosition;
			}
			if (event.target.closest(".comment-btn")) { article.querySelector(".comment-box").classList.toggle("visible"); await showInteractions(article, "comments"); }
			if (event.target.closest(".send-comment")) { const comment = article.querySelector(".comment-box input"); if (comment.value.trim()) { await api.request(`/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ userId: user.id, content: comment.value.trim() }) }); await loadFeed(); } }
			if (event.target.closest(".share-btn")) { openShareDialog(postId); }
		} catch (error) { api.toast(error.message); }
	});
	const avatar = document.getElementById("composerUserAvatar"); if (avatar) avatar.outerHTML = api.avatarMarkup(user);

	// ==========================================
	// CHỨC NĂNG THÔNG BÁO LỜI MỜI KẾT BẠN
	// ==========================================
	const notifBtn = document.querySelector(".notification-btn");
	const badge = document.getElementById("friendRequestBadge");

	if (notifBtn && badge) {
		// 1. Khi click vào chuông -> Chuyển hướng sang trang Bạn bè để đồng ý/từ chối
		notifBtn.addEventListener("click", () => {
			window.location.href = "friends.html";
		});

		// 2. Gọi API lấy danh sách lời mời kết bạn để đếm số lượng
		api.request(`/friend-requests?userId=${user.id}`).then(result => {
			const requests = result.data.requests;
			if (requests && requests.length > 0) {
				// Nếu có người gửi lời mời, cập nhật con số và hiện cục màu đỏ lên
				badge.textContent = requests.length > 9 ? "9+" : requests.length;
				badge.style.display = "inline-block";
			}
		}).catch(error => {
			console.warn("Lỗi khi tải thông báo kết bạn:", error);
		});
	}
	loadFeed();
});
