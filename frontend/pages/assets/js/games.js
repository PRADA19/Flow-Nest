// ==========================================
// STRESS GAMES AND MINDFULNESS INTERACTIVITY
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    // 1. Sidebar Init and Theme Toggles
    if (typeof fetchAndRenderSidebar === "function") {
        fetchAndRenderSidebar();
    }

    // 2. Tab Navigation
    const gameSelectors = document.querySelectorAll(".game-card-btn");
    const gameViews = document.querySelectorAll(".game-view");

    gameSelectors.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetGame = btn.dataset.game;

            gameSelectors.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            gameViews.forEach(view => {
                if (view.id === `game-${targetGame}`) {
                    view.classList.remove("hidden");
                } else {
                    view.classList.add("hidden");
                }
            });

            // Initialize or restart games on tab switch
            if (targetGame === "bubblewrap") {
                initBubbleWrap();
            } else if (targetGame === "memory") {
                initMemoryGame();
            }
        });
    });

    // ==========================================
    // DEEP BREATHING EXERCISE
    // ==========================================
    const breathCircle = document.getElementById("breathCircle");
    const breathText = document.getElementById("breathText");
    const breathTimer = document.getElementById("breathTimer");
    const startBreathBtn = document.getElementById("startBreathBtn");
    const resetBreathBtn = document.getElementById("resetBreathBtn");

    let breathInterval = null;
    let breathSequence = [];
    let breathStep = 0;
    let timerValue = 4;

    // Pattern: 4s Inhale, 4s Hold, 4s Exhale
    const BREATH_PHASES = [
        { label: "Inhale", duration: 4, className: "inhale" },
        { label: "Hold", duration: 4, className: "hold" },
        { label: "Exhale", duration: 4, className: "exhale" }
    ];

    function startBreathing() {
        startBreathBtn.textContent = "Running...";
        startBreathBtn.disabled = true;
        resetBreathBtn.disabled = false;
        breathCircle.className = "breathing-circle";
        
        breathStep = 0;
        runBreathCycle();
    }

    function runBreathCycle() {
        const phase = BREATH_PHASES[breathStep];
        breathCircle.className = `breathing-circle ${phase.className}`;
        breathText.textContent = phase.label;
        timerValue = phase.duration;
        breathTimer.textContent = String(timerValue).padStart(2, "0");

        if (breathInterval) clearInterval(breathInterval);

        breathInterval = setInterval(() => {
            timerValue--;
            breathTimer.textContent = String(timerValue).padStart(2, "0");

            if (timerValue <= 0) {
                clearInterval(breathInterval);
                // Cycle to next phase
                breathStep = (breathStep + 1) % BREATH_PHASES.length;
                runBreathCycle();
            }
        }, 1000);
    }

    function resetBreathing() {
        if (breathInterval) clearInterval(breathInterval);
        breathInterval = null;
        
        breathCircle.className = "breathing-circle";
        breathText.textContent = "Ready";
        breathTimer.textContent = "04";
        startBreathBtn.textContent = "Start Exercise";
        startBreathBtn.disabled = false;
        resetBreathBtn.disabled = true;
    }

    startBreathBtn?.addEventListener("click", startBreathing);
    resetBreathBtn?.addEventListener("click", resetBreathing);

    // ==========================================
    // BUBBLE WRAP STRESS RELIEVER
    // ==========================================
    const bubbleGrid = document.getElementById("bubbleGrid");
    const poppedCountEl = document.getElementById("poppedCount");
    const resetBubbleBtn = document.getElementById("resetBubbleBtn");

    let poppedCount = 0;
    const TOTAL_BUBBLES = 36;

    // Synthesize bubble wrap pop sound
    function playPopSound() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) return;

            const audioCtx = new AudioContextClass();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.type = "sine";
            // Fast pitch sweep pop sound
            osc.frequency.setValueAtTime(450, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(70, audioCtx.currentTime + 0.08);

            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);

            osc.start();
            osc.stop(audioCtx.currentTime + 0.08);
        } catch (e) {
            console.warn("Web Audio API popup failed:", e);
        }
    }

    function initBubbleWrap() {
        if (!bubbleGrid) return;
        bubbleGrid.innerHTML = "";
        poppedCount = 0;
        poppedCountEl.textContent = "0";

        for (let i = 0; i < TOTAL_BUBBLES; i++) {
            const bubble = document.createElement("div");
            bubble.className = "bubble-wrap-item";
            bubble.setAttribute("aria-label", "Unpopped bubble");
            bubble.setAttribute("role", "button");
            bubble.tabIndex = 0;

            const popHandler = () => {
                if (!bubble.classList.contains("popped")) {
                    bubble.classList.add("popped");
                    bubble.setAttribute("aria-label", "Popped bubble");
                    playPopSound();
                    poppedCount++;
                    poppedCountEl.textContent = poppedCount;

                    if (poppedCount === TOTAL_BUBBLES) {
                        setTimeout(() => {
                            showToast("🎉 All bubbles popped! Great relief!", 3000, "success");
                        }, 200);
                    }
                }
            };

            bubble.addEventListener("click", popHandler);
            bubble.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    popHandler();
                }
            });

            bubbleGrid.appendChild(bubble);
        }
    }

    resetBubbleBtn?.addEventListener("click", initBubbleWrap);

    // ==========================================
    // MEMORY MATCH GAME
    // ==========================================
    const memoryGrid = document.getElementById("memoryGrid");
    const memoryMovesEl = document.getElementById("memoryMoves");
    const memoryMatchesEl = document.getElementById("memoryMatches");
    const restartMemoryBtn = document.getElementById("restartMemoryBtn");

    let cardsArray = [];
    let firstCard = null;
    let secondCard = null;
    let lockBoard = false;
    let moves = 0;
    let matches = 0;

    // 8 icon pairs (Phosphor icons)
    const CARD_ICONS = [
        "ph-smiley", "ph-tree", "ph-lightning", "ph-anchor",
        "ph-bicycle", "ph-trophy", "ph-heart", "ph-lamp"
    ];

    function initMemoryGame() {
        if (!memoryGrid) return;
        memoryGrid.innerHTML = "";
        firstCard = null;
        secondCard = null;
        lockBoard = false;
        moves = 0;
        matches = 0;
        memoryMovesEl.textContent = "0";
        memoryMatchesEl.textContent = "0";

        // Duplicate icons to form pairs
        const items = [...CARD_ICONS, ...CARD_ICONS];
        
        // Shuffle array using Fisher-Yates
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }

        items.forEach((iconName, index) => {
            const card = document.createElement("div");
            card.className = "memory-card";
            card.dataset.icon = iconName;
            card.setAttribute("role", "button");
            card.setAttribute("aria-label", "Memory card hidden");
            card.tabIndex = 0;

            card.innerHTML = `
                <div class="card-inner">
                    <div class="card-front">
                        <i class="ph ph-question"></i>
                    </div>
                    <div class="card-back">
                        <i class="ph-bold ${iconName}"></i>
                    </div>
                </div>
            `;

            const flipHandler = () => {
                if (lockBoard) return;
                if (card === firstCard) return;
                if (card.classList.contains("matched")) return;

                card.classList.add("flipped");
                card.setAttribute("aria-label", `Revealed card showing ${iconName.replace("ph-", "")}`);

                if (!firstCard) {
                    firstCard = card;
                    return;
                }

                secondCard = card;
                moves++;
                memoryMovesEl.textContent = moves;
                
                checkCardMatch();
            };

            card.addEventListener("click", flipHandler);
            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    flipHandler();
                }
            });

            memoryGrid.appendChild(card);
        });
    }

    function checkCardMatch() {
        const isMatch = firstCard.dataset.icon === secondCard.dataset.icon;
        if (isMatch) {
            disableCards();
        } else {
            unflipCards();
        }
    }

    function disableCards() {
        firstCard.classList.add("matched");
        secondCard.classList.add("matched");
        
        firstCard.setAttribute("aria-label", "Matched card");
        secondCard.setAttribute("aria-label", "Matched card");

        matches++;
        memoryMatchesEl.textContent = matches;

        resetBoard();

        if (matches === CARD_ICONS.length) {
            setTimeout(() => {
                showToast(`🎉 Complete! Matched all cards in ${moves} moves!`, 4000, "success");
            }, 500);
        }
    }

    function unflipCards() {
        lockBoard = true;
        setTimeout(() => {
            firstCard.classList.remove("flipped");
            secondCard.classList.remove("flipped");
            firstCard.setAttribute("aria-label", "Memory card hidden");
            secondCard.setAttribute("aria-label", "Memory card hidden");
            resetBoard();
        }, 1000);
    }

    function resetBoard() {
        [firstCard, secondCard] = [null, null];
        lockBoard = false;
    }

    restartMemoryBtn?.addEventListener("click", initMemoryGame);

    // Global Toast wrapper fallback
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
