document.addEventListener("DOMContentLoaded", () => {
	const api = window.socialApi; const user = api.getCurrentUser(); const content = document.getElementById("postContent"); if (!user || !content) return; let imageUrl = ""; let videoUrl = "";
	document.querySelector(".create-post-header h2")?.replaceChildren(document.createTextNode(user.fullName));
	const draft = sessionStorage.getItem("miniSocialDraft");
	if (draft) { content.value = draft; sessionStorage.removeItem("miniSocialDraft"); }
	document.getElementById("imageButton")?.addEventListener("click", () => document.getElementById("imageInput").click());
	document.getElementById("imageInput")?.setAttribute("accept", "image/*,video/*");
	document.getElementById("imageInput")?.addEventListener("change", event => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { if (file.type.startsWith("video/")) { videoUrl = reader.result; imageUrl = ""; document.getElementById("imagePreview").style.display = "none"; } else { imageUrl = reader.result; videoUrl = ""; document.getElementById("previewImage").src = imageUrl; document.getElementById("imagePreview").style.display = "block"; } }; reader.readAsDataURL(file); });
	document.getElementById("emojiButton")?.addEventListener("click", () => { const list = document.getElementById("emojiList"); list.style.display = list.style.display === "flex" ? "none" : "flex"; });
	document.getElementById("emojiList")?.addEventListener("click", event => { if (event.target.tagName === "BUTTON") content.value += event.target.textContent; });
	document.getElementById("cancelBtn")?.addEventListener("click", () => { window.location.href = "index.html"; });
	document.getElementById("submitPost")?.addEventListener("click", async () => { const status = document.getElementById("postStatus"); if (!content.value.trim()) { status.textContent = "Hãy nhập nội dung bài viết"; return; } try { await api.request("/posts", { method: "POST", body: JSON.stringify({ userId: user.id, content: content.value.trim(), imageUrl, videoUrl }) }); window.location.href = "index.html"; } catch (error) { status.textContent = error.message; } });
});
