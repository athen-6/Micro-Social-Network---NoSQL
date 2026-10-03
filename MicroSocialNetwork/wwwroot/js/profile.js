document.addEventListener("DOMContentLoaded", async () => {
    const api = window.socialApi;
    const user = api.getCurrentUser();
    const target = document.getElementById("profilePosts");
    if (!user || !target) return;

    const targetUserId = new URLSearchParams(window.location.search).get("userId") || user.id;
    const isOwnProfile = targetUserId === user.id;
    let profileUser;
    let posts = [];
    let currentTab = "posts";

    try { profileUser = (await api.request(`/users/${targetUserId}`)).data.user; }
    catch (error) { target.textContent = error.message; return; }

    document.querySelector(".profile-info h2")?.replaceChildren(document.createTextNode(profileUser.fullName));
    const profileAvatar = document.querySelector(".profile-avatar");
    if (profileAvatar) profileAvatar.outerHTML = api.avatarMarkup(profileUser, "avatar avatar-xl profile-avatar");

    const editButton = document.getElementById("editProfileBtn");
    const addPostButton = document.getElementById("profileAddPostBtn");
    const followButton = document.getElementById("followProfileBtn");
    const addFriendButton = document.getElementById("addFriendBtn");

    if (!isOwnProfile) {
        editButton.hidden = true;
        addPostButton.hidden = true;
        followButton.hidden = false;
        if (addFriendButton) addFriendButton.hidden = false;
    }

    // Bắt sự kiện gửi lời mời kết bạn từ trang cá nhân
    addFriendButton?.addEventListener("click", async () => {
        try {
            await api.request(`/friend-requests/${targetUserId}`, {
                method: "POST",
                body: JSON.stringify({ userId: user.id })
            });
            addFriendButton.textContent = "Đã gửi lời mời";
            addFriendButton.disabled = true;
            addFriendButton.classList.remove("primary-btn");
            addFriendButton.classList.add("small-btn");
            api.toast("Đã gửi lời mời kết bạn");
        } catch (error) {
            api.toast(error.message);
        }
    });

    addPostButton?.addEventListener("click", () => { window.location.href = "create-post.html"; });
    editButton?.addEventListener("click", () => {
        const modal = document.createElement("div");
        modal.className = "login-modal auth-modal";
        modal.innerHTML = `
            <div class="login-card auth-card" style="padding: 24px; width: 400px; max-width: 90%;">
                <div class="auth-brand" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; font-size: 1.25rem;">Chỉnh sửa trang cá nhân</h3>
                    <button class="close-auth" type="button" style="background: none; border: none; font-size: 1.5rem; cursor: pointer;">×</button>
                </div>
                <form id="editProfileForm" style="display: flex; flex-direction: column; gap: 15px;">
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem;">Họ và tên</label>
                        <input name="fullName" value="${api.escapeHtml(profileUser.fullName)}" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-family: inherit;">
                    </div>
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem;">Ảnh đại diện (URL)</label>
                        <input name="avatarUrl" value="${api.escapeHtml(profileUser.avatarUrl || '')}" placeholder="Nhập link ảnh (VD: https://...)" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px; font-family: inherit;">
                    </div>
                    <button class="primary-btn auth-submit" type="submit" style="margin-top: 10px;">Lưu thay đổi</button>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        // Nút tắt Pop-up
        const closeModal = () => modal.remove();
        modal.querySelector(".close-auth").addEventListener("click", closeModal);

        // Bắt sự kiện khi bấm nút Lưu
        modal.querySelector("#editProfileForm").addEventListener("submit", async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const newFullName = formData.get("fullName").trim();
            const newAvatarUrl = formData.get("avatarUrl").trim();

            if (!newFullName) return; if (!newFullName) {
                api.toast("Vui lòng nhập Họ và tên!");
                return;
            }

            const submitBtn = e.target.querySelector("button[type=submit]");
            const originalText = submitBtn.textContent;
            submitBtn.textContent = "Đang lưu...";
            submitBtn.disabled = true;

            try {
                // Gọi API C# để lưu vào Neo4j
                const result = await api.request(`/users/${user.id}`, {
                    method: "PUT",
                    body: JSON.stringify({
                        fullName: newFullName,
                        avatarUrl: newAvatarUrl
                    })
                });

                // Cập nhật lại bộ nhớ trình duyệt
                profileUser = result.data.user;
                localStorage.setItem("miniSocialCurrentUser", JSON.stringify({ ...user, ...profileUser }));

                // Làm mới giao diện ngay lập tức mà không cần F5
                document.querySelector(".profile-info h2")?.replaceChildren(document.createTextNode(profileUser.fullName));
                const profileAvatar = document.querySelector(".profile-avatar");
                if (profileAvatar) profileAvatar.outerHTML = api.avatarMarkup(profileUser, "avatar avatar-xl profile-avatar");

                api.toast("Đã cập nhật trang cá nhân");
                closeModal();

                // Cập nhật cả avatar nhỏ ở góc trên bên phải (Topbar)
                window.location.reload();
            } catch (error) {
                api.toast(error.message);
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        });
    });


    function renderPost(post) {
        return `<article class="card post" data-post-id="${api.escapeHtml(post.id)}"><div class="post-head">${api.avatarMarkup(post.author)}<div><b>${api.escapeHtml(post.author.fullName)}</b><small>${api.formatDate(post.createdAt)}</small></div></div><p>${api.escapeHtml(post.content)}</p>${post.imageUrl ? `<div class="post-image-box"><img src="${api.escapeHtml(api.mediaUrl(post.imageUrl))}" alt="Ảnh"></div>` : ""}${!post.imageUrl && post.videoUrl ? `<div class="post-image-box"><video src="${api.escapeHtml(api.mediaUrl(post.videoUrl))}" controls></video>` : ""}<div class="post-stats"><button class="interaction-link" data-profile-interaction="likes" type="button">${post.stats.likeCount} lượt thích</button><button class="interaction-link" data-profile-interaction="comments" type="button">${post.stats.commentCount} bình luận</button><button class="interaction-link" data-profile-interaction="shares" type="button">${post.stats.shareCount || 0} chia sẻ</button></div><div class="post-actions"><button class="like-btn ${post.userInteraction.isLiked ? "active" : ""}" data-liked="${post.userInteraction.isLiked}" type="button">${post.userInteraction.isLiked ? "♥" : "♡"} Thích</button><button class="comment-btn" type="button">▢ Bình luận</button><button class="share-btn" type="button">↗ Chia sẻ</button></div><div class="comment-box"><input placeholder="Viết bình luận..."><button class="send-comment" type="button">Gửi</button></div><div class="interaction-details" hidden></div></article>`;
    }

    function addPostMenus() {
        target.querySelectorAll("[data-post-id]").forEach(article => {
            const post = posts.find(item => item.id === article.dataset.postId);
            if (!post || post.author.id !== user.id || article.querySelector(".post-menu-wrap")) return;
            const head = article.querySelector(".post-head");
            head.insertAdjacentHTML("beforeend", `<div class="post-menu-wrap"><button type="button" class="dots" aria-label="Tùy chọn bài viết">...</button><div class="post-menu"><button type="button" class="delete-post-btn">Xóa bài</button></div></div>`);
        });
    }

    async function showInteractions(article, type) {
        const panel = article.querySelector(".interaction-details");
        if (!panel.hidden && panel.dataset.type === type) { panel.hidden = true; return; }
        try {
            const result = await api.request(`/posts/${article.dataset.postId}/interactions`);
            const items = result.data[type] || [];
            panel.dataset.type = type;
            if (type === "comments") panel.innerHTML = items.length ? items.map(item => `<div class="comment-item"><b>${api.escapeHtml(item.user.fullName)}</b><span>${api.escapeHtml(item.content)}</span></div>`).join("") : "<small>Chưa có bình luận nào.</small>";
            else if (type === "likes") panel.innerHTML = items.length ? `<div class="interaction-people likes-dropdown"><b>Người đã thích:</b><div class="interaction-avatar-list">${items.map(item => `<div class="interaction-person">${api.avatarMarkup(item.user, "avatar avatar-sm")}<span><b>${api.escapeHtml(item.user.fullName)}</b><small>${api.escapeHtml(item.user.username)}</small></span></div>`).join("")}</div></div>` : "<small>Chưa có lượt thích nào.</small>";
            else panel.innerHTML = items.length ? items.map(item => api.escapeHtml(item.user.fullName)).join(", ") : "<small>Chưa có tương tác nào.</small>";
            panel.hidden = false;
        } catch (error) { api.toast(error.message); }
    }

    async function sharePost(postId) {
        try {
            const result = await api.request(`/friends?userId=${user.id}`);
            const friends = result.data.friends;
            if (!friends.length) return api.toast("Bạn chưa có bạn bè để chia sẻ");
            const modal = document.createElement("div");
            modal.className = "login-modal share-modal";
            modal.innerHTML = `<div class="login-card"><button class="close-auth" type="button">×</button><h3>Chia sẻ bài viết</h3><p>Chia sẻ đến ai?</p><div class="share-friends">${friends.map(friend => `<button type="button" class="share-friend" data-recipient-id="${api.escapeHtml(friend.id)}">${api.avatarMarkup(friend, "avatar avatar-sm")}<span><b>${api.escapeHtml(friend.fullName)}</b><small>@${api.escapeHtml(friend.username)}</small></span></button>`).join("")}</div></div>`;
            document.body.appendChild(modal);
            modal.querySelector(".close-auth").addEventListener("click", () => modal.remove());
            modal.querySelector(".share-friends").addEventListener("click", async event => { const friend = event.target.closest(".share-friend"); if (!friend) return; const recipient = friends.find(item => item.id === friend.dataset.recipientId); try { await api.request(`/posts/${postId}/share`, { method: "POST", body: JSON.stringify({ userId: user.id, recipientId: recipient.id }) }); modal.remove(); await loadTab(currentTab); api.toast(`Đã chia sẻ đến ${recipient.fullName}`); } catch (error) { api.toast(error.message); } });
        } catch (error) { api.toast(error.message); }
    }

    async function loadTab(tab) {
        currentTab = tab;
        if (tab === "intro") { target.innerHTML = `<div class="card post"><h3>Giới thiệu</h3><p>${api.escapeHtml(profileUser.fullName)}</p><p>${api.escapeHtml(profileUser.username)}</p><p>⌖ Hà Nội</p></div>`; return; }
        if (tab === "friends") {
            try { const result = await api.request(`/friends?userId=${targetUserId}`); target.innerHTML = result.data.friends.map(friend => `<div class="card post"><div class="post-head">${api.avatarMarkup(friend)}<div><b>${api.escapeHtml(friend.fullName)}</b><small>${api.escapeHtml(friend.username)}</small></div></div></div>`).join("") || "<div class=\"card post\">Chưa có bạn bè.</div>"; } catch (error) { target.textContent = error.message; }
            return;
        }
        let visiblePosts = posts;
        if (tab === "images") visiblePosts = posts.filter(post => post.imageUrl);
        if (tab === "videos") visiblePosts = posts.filter(post => post.videoUrl);
        if (tab === "likes") {
            const liked = await Promise.all(posts.map(async post => { const result = await api.request(`/posts/${post.id}/interactions`); return result.data.likes.some(item => item.user.id === user.id) ? post : null; }));
            visiblePosts = liked.filter(Boolean);
        }
        target.innerHTML = visiblePosts.length ? visiblePosts.map(renderPost).join("") : `<div class="card post">Chưa có nội dung trong mục này.</div>`;
        addPostMenus();
    }

    try {
        const [postResult, statsResult] = await Promise.all([api.request(`/posts?userId=${user.id}`), api.request(`/users/${targetUserId}/stats?currentUserId=${user.id}`)]);
        posts = postResult.data.posts.filter(post => post.author.id === targetUserId);
        document.getElementById("profilePostCount").textContent = posts.length;
        document.getElementById("profileFriendCount").textContent = statsResult.data.friendCount;
        document.getElementById("profileFollowerCount").textContent = statsResult.data.followerCount;
        document.getElementById("profileFollowingCount").textContent = statsResult.data.followingCount;
        if (!isOwnProfile) {
            followButton.textContent = statsResult.data.isFollowing ? "Hủy theo dõi" : "Theo dõi";
            followButton.dataset.following = String(statsResult.data.isFollowing);
            followButton.addEventListener("click", async () => { const following = followButton.dataset.following === "true"; try { const result = await api.request(`/users/${targetUserId}/follow`, { method: "POST", body: JSON.stringify({ userId: user.id, action: following ? "UNFOLLOW" : "FOLLOW" }) }); followButton.dataset.following = String(result.data.isFollowing); followButton.textContent = result.data.isFollowing ? "Hủy theo dõi" : "Theo dõi"; document.getElementById("profileFollowerCount").textContent = result.data.followerCount; } catch (error) { api.toast(error.message); } });
        }
        document.querySelectorAll("[data-tab]").forEach(tab => tab.addEventListener("click", () => { document.querySelectorAll("[data-tab]").forEach(item => item.classList.toggle("active", item === tab)); loadTab(tab.dataset.tab); }));
        target.addEventListener("click", async event => {
            const article = event.target.closest("[data-post-id]"); if (!article) return;
            const postId = article.dataset.postId;
            if (event.target.closest(".dots")) { event.stopPropagation(); article.querySelector(".post-menu")?.classList.toggle("show"); return; }
            if (event.target.closest(".delete-post-btn")) {
                if (!window.confirm("Bạn có chắc muốn xóa bài viết này không?")) return;
                try { await api.request(`/posts/${postId}`, { method: "DELETE", body: JSON.stringify({ userId: user.id }) }); await loadTab(currentTab); api.toast("Đã xóa bài viết"); } catch (error) { api.toast(error.message); }
                return;
            }
            if (event.target.closest("[data-profile-interaction]")) return showInteractions(article, event.target.closest("[data-profile-interaction]").dataset.profileInteraction);
            if (event.target.closest(".like-btn")) { const button = event.target.closest(".like-btn"); const result = await api.request(`/posts/${postId}/like`, { method: "POST", body: JSON.stringify({ userId: user.id, action: button.dataset.liked === "true" ? "UNLIKE" : "LIKE" }) }); button.dataset.liked = String(result.data.isLiked); button.innerHTML = `${result.data.isLiked ? "♥" : "♡"} Thích`; article.querySelector('[data-profile-interaction="likes"]').textContent = `${result.data.newLikeCount} lượt thích`; }
            if (event.target.closest(".comment-btn")) { article.querySelector(".comment-box").classList.toggle("visible"); await showInteractions(article, "comments"); }
            if (event.target.closest(".send-comment")) { const input = article.querySelector(".comment-box input"); if (input.value.trim()) { await api.request(`/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ userId: user.id, content: input.value.trim() }) }); await loadTab(currentTab); } }
            if (event.target.closest(".share-btn")) await sharePost(postId);
        });
        await loadTab("posts");
    } catch (error) { target.textContent = error.message; }
});
