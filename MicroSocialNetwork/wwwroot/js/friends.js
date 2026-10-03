document.addEventListener("DOMContentLoaded", async () => {
	const api = window.socialApi;
	const user = api.getCurrentUser();
	const list = document.getElementById("friendList");
	const search = document.getElementById("friendSearch");
	const requestsPanel = document.getElementById("friendRequests");
	if (!user || !list) return;
	let friends = [];
	let currentType = "all";
	const render = items => {
		const emptyMessage = currentType === "following" ? "Chưa có ai đang theo dõi." : currentType === "followers" ? "Chưa có ai theo dõi bạn." : currentType === "close" ? "Chưa có bạn thân." : "Chưa có bạn bè phù hợp.";
		list.innerHTML = items.length ? items.map(friend => `<div class="result-row"><a href="profile.html?userId=${encodeURIComponent(friend.id)}">${api.avatarMarkup(friend)}</a><div class="result-info"><b>${api.escapeHtml(friend.fullName)}</b><small>${api.escapeHtml(friend.username)}</small></div><button class="small-btn" type="button" data-remove-id="${api.escapeHtml(friend.id)}">Hủy bạn bè</button></div>`).join("") : `<p>${emptyMessage}</p>`;
	};
	async function loadFriends(type = currentType) {
		currentType = type;
		try {
			const endpointType = type === "following" || type === "followers" ? `&type=${type}` : "";
			const result = await api.request(`/friends?userId=${user.id}${endpointType}`);
			friends = result.data.friends;
			render(friends);
		} catch (error) { list.textContent = error.message; }
	}
	async function loadRequests() {
		if (!requestsPanel) return;
		try {
			const result = await api.request(`/friend-requests?userId=${user.id}`);
			requestsPanel.innerHTML = result.data.requests.length ? `<h3>Lời mời kết bạn</h3>` + result.data.requests.map(request => `<div class="friend-request"><div class="result-row"><a href="profile.html?userId=${encodeURIComponent(request.fromUser.id)}">${api.avatarMarkup(request.fromUser)}</a><div class="result-info"><b>${api.escapeHtml(request.fromUser.fullName)}</b><small>Muốn kết bạn với bạn</small></div><button class="primary-btn" type="button" data-request-id="${api.escapeHtml(request.id)}" data-request-action="ACCEPT">Đồng ý</button><button class="small-btn" type="button" data-request-id="${api.escapeHtml(request.id)}" data-request-action="REJECT">Từ chối</button></div></div>`).join("") : "";
		} catch (error) { requestsPanel.textContent = error.message; }
	}
	document.querySelectorAll("[data-friend-type]").forEach(tab => tab.addEventListener("click", () => { document.querySelectorAll("[data-friend-type]").forEach(item => item.classList.toggle("active", item === tab)); loadFriends(tab.dataset.friendType === "close" ? "all" : tab.dataset.friendType); }));
	list.addEventListener("click", async event => { const button = event.target.closest("[data-remove-id]"); if (!button) return; try { await api.request(`/friends/${button.dataset.removeId}`, { method: "POST", body: JSON.stringify({ userId: user.id, action: "REMOVE" }) }); await loadFriends(); api.toast("Đã hủy kết bạn"); } catch (error) { api.toast(error.message); } });
	requestsPanel?.addEventListener("click", async event => { const button = event.target.closest("[data-request-id]"); if (!button) return; try { await api.request(`/friend-requests/${button.dataset.requestId}/respond`, { method: "POST", body: JSON.stringify({ userId: user.id, action: button.dataset.requestAction }) }); await loadRequests(); if (button.dataset.requestAction === "ACCEPT") await loadFriends(); api.toast(button.dataset.requestAction === "ACCEPT" ? "Đã đồng ý kết bạn" : "Đã từ chối lời mời"); } catch (error) { api.toast(error.message); } });
	search?.addEventListener("input", () => { const q = search.value.toLowerCase(); render(friends.filter(friend => `${friend.fullName} ${friend.username}`.toLowerCase().includes(q))); });
	await loadFriends();
	await loadRequests();
});
