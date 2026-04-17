/**
 * Analyses user stats and generates specific action items
 * No AI needed — pure data-driven recommendations
 */
export function generateActionItems(stats, solutions = []) {
  if (!stats) return [];

  const actions = [];
  const total = stats.totalSolved || 0;

  // ── Review queue overdue ───────────────────────────
  if (stats.reviewsDue > 0) {
    actions.push({
      priority: 1,
      icon: "🧠",
      title: `Clear ${stats.reviewsDue} overdue review${stats.reviewsDue !== 1 ? "s" : ""}`,
      desc: "Overdue reviews directly lower your retention score. Clear them today.",
      color: "warning",
      link: "/review",
      linkLabel: "Open Review Queue",
    });
  }

  // ── Never done a simulation ────────────────────────
  if (stats.simCount === 0 && total >= 2) {
    actions.push({
      priority: 2,
      icon: "⏱",
      title: "Try your first interview simulation",
      desc: "You've solved enough problems to test yourself under timed pressure.",
      color: "brand",
      link: "/interview",
      linkLabel: "Start Simulation",
    });
  }

  // ── Low sim score ──────────────────────────────────
  if (stats.completedSims > 0 && stats.avgSimScore < 3) {
    actions.push({
      priority: 3,
      icon: "🎯",
      title: "Improve interview simulation performance",
      desc: `Your average sim score is ${stats.avgSimScore}/5. Practice thinking out loud while solving.`,
      color: "danger",
      link: "/interview",
      linkLabel: "Practice Again",
    });
  }

  // ── No hard problems solved ────────────────────────
  if (stats.hard === 0 && total >= 3) {
    actions.push({
      priority: 3,
      icon: "🔴",
      title: "Attempt a hard problem",
      desc: "You've only solved easy and medium problems. Hard problems build real confidence.",
      color: "danger",
      link: "/problems",
      linkLabel: "Browse Problems",
    });
  }

  // ── Low pattern diversity ──────────────────────────
  if (stats.patternsCount < 4 && total >= 4) {
    actions.push({
      priority: 4,
      icon: "🗺️",
      title: `Diversify your patterns — only ${stats.patternsCount} covered`,
      desc: "Top interviews test multiple patterns. Try a pattern you haven't touched yet.",
      color: "brand",
      link: "/problems",
      linkLabel: "Find New Patterns",
    });
  }

  // ── Missing key insights ───────────────────────────
  if (total > 0 && stats.withKeyInsight !== undefined) {
    const missingInsights = total - (stats.withKeyInsight || 0);
    if (missingInsights > 0 && missingInsights >= total * 0.4) {
      actions.push({
        priority: 5,
        icon: "💡",
        title: `Add key insights to ${missingInsights} solution${missingInsights !== 1 ? "s" : ""}`,
        desc: "Key insights help you recall the core idea during reviews. Go back and fill them in.",
        color: "info",
        link: "/problems",
        linkLabel: "View Problems",
      });
    }
  }

  // ── Missing Feynman explanations ───────────────────
  if (total > 0 && stats.withFeynman !== undefined) {
    const missingFeynman = total - (stats.withFeynman || 0);
    if (missingFeynman > 0 && missingFeynman >= total * 0.5) {
      actions.push({
        priority: 5,
        icon: "🗣",
        title: "Write simple explanations for your solutions",
        desc: `${missingFeynman} solution${missingFeynman !== 1 ? "s are" : " is"} missing explanations. This builds your communication score.`,
        color: "info",
        link: "/problems",
        linkLabel: "View Problems",
      });
    }
  }

  // ── Streak is 0 ────────────────────────────────────
  if (stats.streak === 0 && total > 0) {
    actions.push({
      priority: 4,
      icon: "🔥",
      title: "Restart your streak",
      desc: "Your streak broke. Solve one problem today to start building momentum again.",
      color: "warning",
      link: "/problems",
      linkLabel: "Solve a Problem",
    });
  }

  // ── Low confidence solutions ───────────────────────
  if (solutions?.length > 0) {
    const lowConf = solutions.filter((s) => s.confidenceLevel <= 2).length;
    if (lowConf >= 2) {
      actions.push({
        priority: 4,
        icon: "📉",
        title: `${lowConf} solutions have low confidence`,
        desc: "Review these problems — if you can't explain them, you haven't learned them.",
        color: "warning",
        link: "/review",
        linkLabel: "Review Queue",
      });
    }
  }

  // ── Solved this week is 0 ──────────────────────────
  if (stats.solvedThisWeek === 0 && total > 0) {
    actions.push({
      priority: 3,
      icon: "📅",
      title: "You haven't solved anything this week",
      desc: "Consistency beats volume. Even one problem today keeps your skills sharp.",
      color: "warning",
      link: "/problems",
      linkLabel: "Start Solving",
    });
  }

  // ── Everything is great ────────────────────────────
  if (actions.length === 0 && total > 0) {
    actions.push({
      priority: 99,
      icon: "🏆",
      title: "You're doing great — keep the momentum!",
      desc: "All areas are looking solid. Keep solving, keep reviewing, keep growing.",
      color: "success",
      link: "/problems",
      linkLabel: "Browse Problems",
    });
  }

  // Sort by priority and return top 5
  return actions.sort((a, b) => a.priority - b.priority).slice(0, 5);
}

/**
 * Generate a one-line overall verdict based on scores
 */
export function getOverallVerdict(overallScore, dims = {}) {
  if (overallScore >= 80)
    return {
      label: "Excellent",
      color: "text-success",
      summary:
        "You're interview-ready across all dimensions. Keep practicing to stay sharp.",
    };
  if (overallScore >= 65)
    return {
      label: "Strong",
      color: "text-brand-300",
      summary:
        "Solid foundation. Focus on your weakest dimension to break through to the next level.",
    };
  if (overallScore >= 45)
    return {
      label: "Developing",
      color: "text-warning",
      summary:
        "Good progress but gaps remain. The action items below target your biggest opportunities.",
    };
  if (overallScore >= 25)
    return {
      label: "Building",
      color: "text-warning",
      summary:
        "You're building the foundation. Focus on solving more problems and filling out your solutions completely.",
    };
  return {
    label: "Getting Started",
    color: "text-text-tertiary",
    summary:
      "Welcome! Start by solving a few problems and the platform will guide you from there.",
  };
}

/**
 * Find the weakest and strongest dimensions
 */
export function getStrengthsAndWeaknesses(dims = {}) {
  const entries = Object.entries(dims)
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);

  const DIM_LABELS = {
    patternRecognition: {
      label: "Pattern Recognition",
      icon: "🧩",
      tip: "Tag patterns on every solution and practice identifying them before coding.",
    },
    solutionDepth: {
      label: "Solution Depth",
      icon: "📝",
      tip: "Fill in key insights, Feynman explanations, and follow-up answers on every submission.",
    },
    communication: {
      label: "Communication",
      icon: "🗣",
      tip: "Write clear explanations and ask teammates to rate your solution clarity.",
    },
    optimization: {
      label: "Optimization",
      icon: "⚡",
      tip: "Always write the brute force first, then optimize. Document both time and space complexity.",
    },
    pressurePerformance: {
      label: "Pressure Performance",
      icon: "⏱",
      tip: "Do more interview simulations. Practice thinking out loud under a timer.",
    },
    retention: {
      label: "Knowledge Retention",
      icon: "🧠",
      tip: "Clear your review queue daily. Low confidence reviews get scheduled sooner.",
    },
  };

  const strengths = entries
    .filter((e) => e.score >= 50)
    .slice(0, 2)
    .map((e) => ({ ...e, ...DIM_LABELS[e.id] }));

  const weaknesses = entries
    .filter((e) => e.score < 80)
    .reverse()
    .slice(0, 2)
    .map((e) => ({ ...e, ...DIM_LABELS[e.id] }));

  return { strengths, weaknesses };
}
