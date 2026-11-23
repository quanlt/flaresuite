import type { PresentationContent, Slide } from "@/lib/office/types";
import type { OfficeAppClient } from "../office-types";
import { downloadBlob, safeFileName } from "../office-client-utils";
import { sanitizeOfficeHtml } from "../sanitize";
import { buildPresentationHtml, createSlide, SLIDE_THEMES } from "./slides-utils";
import type { SlideThemeId } from "./slides-types";

const list = (items: string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;

function deck(themeId: SlideThemeId, build: (theme: (typeof SLIDE_THEMES)[SlideThemeId]) => Slide[]): PresentationContent {
	const theme = SLIDE_THEMES[themeId];
	return { theme: { ...theme }, slides: build(theme) };
}

/** Slides: templates on the home page and the standalone HTML export. */
export const slidesApp: OfficeAppClient<"presentation"> = {
	kind: "presentation",
	templates: [
		{
			id: "pitch-deck",
			labelKey: "slides.template.pitchDeck",
			create: () => deck("blue", (theme) => [
				createSlide("title", theme, { title: "Company name", body: "One sentence about what you do" }),
				createSlide("titleBody", theme, { title: "The problem", body: list(["Who has the problem", "How they solve it today", "Why that is not good enough"]) }),
				createSlide("titleBody", theme, { title: "Our solution", body: list(["What the product does", "The key insight behind it", "Why now"]) }),
				createSlide("twoColumns", theme, { title: "Market", body: "<p><b>Total market</b></p><p>Size and growth</p>", body2: "<p><b>Our first customers</b></p><p>Who buys first and why</p>" }),
				createSlide("titleBody", theme, { title: "Business model", body: list(["How we make money", "Pricing", "Unit economics"]) }),
				createSlide("titleBody", theme, { title: "Traction", body: list(["Customers", "Revenue or usage", "Milestones reached"]) }),
				createSlide("titleBody", theme, { title: "Team", body: list(["Founder — background", "Founder — background", "Advisors"]) }),
				createSlide("section", theme, { title: "The ask", body: "How much we are raising and what it buys" }),
			]),
		},
		{
			id: "project-update",
			labelKey: "slides.template.projectUpdate",
			create: () => deck("light", (theme) => [
				createSlide("title", theme, { title: "Project update", body: "Team name · Date" }),
				createSlide("titleBody", theme, { title: "Summary", body: list(["Overall status: on track", "Highlights since the last update", "Decisions needed"]) }),
				createSlide("twoColumns", theme, { title: "Progress", body: "<p><b>Done</b></p>" + list(["Milestone one", "Milestone two"]), body2: "<p><b>Next</b></p>" + list(["Upcoming milestone", "Upcoming milestone"]) }),
				createSlide("titleBody", theme, { title: "Risks and issues", body: list(["Risk — impact — mitigation", "Issue — owner — due date"]) }),
				createSlide("titleBody", theme, { title: "Timeline", body: list(["Phase 1 — dates", "Phase 2 — dates", "Launch — date"]) }),
				createSlide("section", theme, { title: "Questions", body: "Thank you" }),
			]),
		},
		{
			id: "lesson",
			labelKey: "slides.template.lesson",
			create: () => deck("warm", (theme) => [
				createSlide("title", theme, { title: "Lesson title", body: "Course · Week 1" }),
				createSlide("titleBody", theme, { title: "Learning goals", body: list(["By the end of this lesson you can…", "Explain…", "Apply…"]) }),
				createSlide("section", theme, { title: "Part 1", body: "Key idea" }),
				createSlide("titleBody", theme, { title: "Key idea", body: "<p>Explain the idea in a few short sentences.</p>" + list(["Example", "Counter-example"]) }),
				createSlide("imageCaption", theme, { title: "A picture or diagram that makes the idea concrete" }),
				createSlide("titleBody", theme, { title: "Practice", body: list(["Exercise 1", "Exercise 2", "Discuss with a partner"]) }),
				createSlide("titleBody", theme, { title: "Summary", body: list(["What we learned", "Homework", "Next lesson"]) }),
			]),
		},
	],
	exports: [
		{
			id: "html",
			labelKey: "slides.export.html",
			run: (content, name) => {
				const html = buildPresentationHtml(content, name, sanitizeOfficeHtml);
				downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), safeFileName(name, "html"));
			},
		},
	],
};
