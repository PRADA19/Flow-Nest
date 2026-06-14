// FlowNest Reset Password Page Controller
document.addEventListener("DOMContentLoaded", () => {
    // 1. Resolve Token and Init Views
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get("token");

    const checkingState = document.getElementById("tokenChecking");
    const errorState = document.getElementById("tokenError");
    const resetForm = document.getElementById("resetForm");
    const successState = document.getElementById("resetSuccess");

    // Check if token exists in the query parameters
    setTimeout(() => {
        checkingState.classList.add("hidden");
        if (!token) {
            errorState.classList.remove("hidden");
        } else {
            resetForm.classList.remove("hidden");
            document.getElementById("newPassword").focus();
        }
    }, 800); // Small delay for visual consistency

    // 2. Toggle Password Input Visibility
    const toggleButtons = document.querySelectorAll(".toggle-password-btn");
    toggleButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const input = btn.previousElementSibling;
            if (!input) return;

            const isPassword = input.type === "password";
            input.type = isPassword ? "text" : "password";

            const icon = btn.querySelector("i");
            if (icon) {
                icon.className = isPassword ? "ph-bold ph-eye-slash" : "ph-bold ph-eye";
            }
        });
    });

    // 3. Real-time Password Strength Validator
    const newPassword = document.getElementById("newPassword");
    const confirmPassword = document.getElementById("confirmPassword");
    const strengthBar = document.getElementById("strengthBar");
    const strengthText = document.getElementById("strengthText");
    const resetSubmitBtn = document.getElementById("resetSubmitBtn");

    let isStrengthValid = false;
    let isMatchValid = false;

    newPassword.addEventListener("input", () => {
        const val = newPassword.value;
        let score = 0;

        if (val.length === 0) {
            strengthBar.style.width = "0%";
            strengthText.textContent = "Password Strength";
            strengthText.style.color = "var(--text-muted)";
            isStrengthValid = false;
            validateForm();
            return;
        }

        // Rule 1: Min length of 6 characters
        if (val.length >= 6) score += 1;
        
        // Rule 2: Contains numbers and letters
        if (/[A-Za-z]/.test(val) && /[0-9]/.test(val)) score += 1;

        // Rule 3: Contains special characters
        if (/[^A-Za-z0-9]/.test(val)) score += 1;

        // Map score to visual strength bar
        if (val.length < 6) {
            strengthBar.style.width = "25%";
            strengthBar.style.backgroundColor = "#ef4444"; // Red
            strengthText.textContent = "Too Short (Min 6 chars)";
            strengthText.style.color = "#ef4444";
            isStrengthValid = false;
        } else if (score === 1) {
            strengthBar.style.width = "50%";
            strengthBar.style.backgroundColor = "#f97316"; // Orange
            strengthText.textContent = "Weak";
            strengthText.style.color = "#f97316";
            isStrengthValid = true;
        } else if (score === 2) {
            strengthBar.style.width = "75%";
            strengthBar.style.backgroundColor = "#eab308"; // Yellow
            strengthText.textContent = "Medium";
            strengthText.style.color = "#eab308";
            isStrengthValid = true;
        } else {
            strengthBar.style.width = "100%";
            strengthBar.style.backgroundColor = "#10b981"; // Green
            strengthText.textContent = "Strong";
            strengthText.style.color = "#10b981";
            isStrengthValid = true;
        }

        checkPasswordsMatch();
        validateForm();
    });

    // 4. Confirm Password Match Checker
    confirmPassword.addEventListener("input", () => {
        checkPasswordsMatch();
        validateForm();
    });

    function checkPasswordsMatch() {
        const p1 = newPassword.value;
        const p2 = confirmPassword.value;
        const matchText = document.getElementById("matchText");

        if (p2.length === 0) {
            matchText.textContent = "";
            matchText.className = "validation-message";
            isMatchValid = false;
            return;
        }

        if (p1 === p2) {
            matchText.textContent = "✓ Passwords match";
            matchText.className = "validation-message success";
            isMatchValid = true;
        } else {
            matchText.textContent = "✗ Passwords do not match";
            matchText.className = "validation-message error";
            isMatchValid = false;
        }
    }

    function validateForm() {
        resetSubmitBtn.disabled = !(isStrengthValid && isMatchValid);
    }

    // 5. Submit Form Request
    resetForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!isStrengthValid || !isMatchValid || !token) {
            showToast("Please satisfy password requirements.");
            return;
        }

        resetSubmitBtn.disabled = true;
        resetSubmitBtn.textContent = "Updating Password...";

        try {
            // Dispatch AJAX POST request
            const response = await fetch(apiUrl("/auth/reset-password"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token,
                    password: newPassword.value
                })
            });

            const data = await parseJsonResponse(response);

            if (!response.ok) {
                throw new Error(data.error || "Failed to reset password.");
            }

            // Show success transition
            resetForm.classList.add("hidden");
            successState.classList.remove("hidden");
            showToast("Password updated successfully!", 3000, "success");

            // Redirect back to login screen after 3.5 seconds
            setTimeout(() => {
                window.location.href = "index.html";
            }, 3500);

        } catch (err) {
            console.error("Reset password submit error:", err);
            showToast(err.message || "Failed to reset password.", 5000, "error");
            resetSubmitBtn.disabled = false;
            resetSubmitBtn.textContent = "Update Password";
        }
    });

    // Toast Manager Fallback
    function showToast(message, duration = 2500, type = "info") {
        if (typeof window.showToast === "function") {
            window.showToast(message, duration, type);
        } else {
            const toast = document.getElementById("toast");
            if (!toast) return;
            toast.textContent = message;
            toast.className = "toast";
            if (type === "success") toast.classList.add("success");
            if (type === "error") toast.classList.add("error");
            
            toast.classList.add("show");
            setTimeout(() => {
                toast.classList.remove("show");
            }, duration);
        }
    }
});
