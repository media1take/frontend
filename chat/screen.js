function applyResponsiveMode() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const body = document.body;

    // Clear all modes
    body.classList.remove(
        "desktop", "tablet", "mobile-portrait",
        "mobile-landscape", "small-mobile",
        "xsmall-mobile", "very-small-height"
    );

    // Very small height devices (<500px)
    if (height < 500) {
        body.classList.add("very-small-height");
        return;
    }

    // Extra small mobile (≤375px)
    if (width <= 375) {
        body.classList.add("xsmall-mobile");
        return;
    }

    // Small mobile (≤450px)
    if (width <= 450) {
        body.classList.add("small-mobile");
        return;
    }

    // Mobile portrait (≤500px)
    if (width <= 500) {
        body.classList.add("mobile-portrait");
        return;
    }

    // Mobile landscape (≤700px)
    if (width <= 700 && width > height) {
        body.classList.add("mobile-landscape");
        return;
    }

    // Tablet (≤900px)
    if (width <= 900) {
        body.classList.add("tablet");
        return;
    }

    // Desktop (default)
    body.classList.add("desktop");
}

// Run on load
applyResponsiveMode();

// Run on resize/orientation change
window.addEventListener("resize", applyResponsiveMode);
window.addEventListener("orientationchange", applyResponsiveMode);

// Prevent iOS zoom on input focus
document.addEventListener("touchstart", function (event) {
    const target = event.target;
    if (target.tagName === "TEXTAREA") {
        target.style.fontSize = "16px";
    }
});
