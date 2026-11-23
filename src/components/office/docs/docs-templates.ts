import type { OfficeTemplate } from "../office-types";
import { DEFAULT_DOC_PAGE } from "./docs-utils";

const today = () => new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(new Date());

const LETTER = () => `<p>Your Name<br>Street address<br>City, Postal code<br>you@example.com</p>
<p><br></p>
<p>${today()}</p>
<p><br></p>
<p>Recipient Name<br>Title<br>Company<br>Street address<br>City, Postal code</p>
<p><br></p>
<p>Dear Recipient Name,</p>
<p>I am writing to … State the purpose of your letter in the first paragraph.</p>
<p>Use the second paragraph for the details: what happened, what you need, or what you are offering. Keep it specific and short.</p>
<p>Close with the next step you expect, and thank the reader for their time.</p>
<p><br></p>
<p>Sincerely,</p>
<p><br></p>
<p>Your Name</p>`;

const MEETING_NOTES = () => `<h1 data-title="true">Meeting notes</h1>
<p><strong>Date:</strong> ${today()}<br><strong>Attendees:</strong> Name, Name, Name<br><strong>Facilitator:</strong> Name</p>
<h2>Agenda</h2>
<ol><li>Review of last meeting's action items</li><li>Topic one</li><li>Topic two</li></ol>
<h2>Notes</h2>
<ul><li>Key point discussed</li><li>Decision reached and who agreed</li></ul>
<h2>Decisions</h2>
<ul><li>Decision</li></ul>
<h2>Action items</h2>
<ul data-type="checklist"><li data-checked="false">Owner — task — due date</li><li data-checked="false">Owner — task — due date</li></ul>
<h2>Next meeting</h2>
<p>Date, time and location.</p>`;

const PROJECT_PROPOSAL = () => `<h1 data-title="true">Project proposal</h1>
<p><strong>Prepared by:</strong> Your Name &nbsp;·&nbsp; <strong>Date:</strong> ${today()}</p>
<h2>Summary</h2>
<p>One paragraph describing the project, the problem it solves and the expected outcome.</p>
<h2>Problem</h2>
<p>Describe the current situation, who it affects and why it matters now.</p>
<h2>Goals</h2>
<ul><li>Goal one, measurable</li><li>Goal two, measurable</li></ul>
<h2>Scope</h2>
<table><thead><tr><th>In scope</th><th>Out of scope</th></tr></thead><tbody><tr><td>Item</td><td>Item</td></tr><tr><td>Item</td><td>Item</td></tr></tbody></table>
<h2>Timeline</h2>
<table><thead><tr><th>Milestone</th><th>Owner</th><th>Date</th></tr></thead><tbody><tr><td>Kick-off</td><td>Name</td><td>Date</td></tr><tr><td>First delivery</td><td>Name</td><td>Date</td></tr><tr><td>Launch</td><td>Name</td><td>Date</td></tr></tbody></table>
<h2>Budget</h2>
<p>Estimated cost and how it breaks down.</p>
<h2>Risks</h2>
<ul><li>Risk and how it will be mitigated</li></ul>
<h2>Next steps</h2>
<ul data-type="checklist"><li data-checked="false">Approve the proposal</li><li data-checked="false">Assign the team</li></ul>`;

const RESUME = () => `<h1 data-title="true">Your Name</h1>
<p>City, Country &nbsp;·&nbsp; you@example.com &nbsp;·&nbsp; +00 000 000 000 &nbsp;·&nbsp; linkedin.com/in/you</p>
<hr>
<h2>Summary</h2>
<p>Two or three sentences about your experience and what you are looking for.</p>
<h2>Experience</h2>
<h3>Job title — Company</h3>
<p><em>Month Year – Present · City</em></p>
<ul><li>Achievement with a measurable result</li><li>Achievement with a measurable result</li></ul>
<h3>Job title — Company</h3>
<p><em>Month Year – Month Year · City</em></p>
<ul><li>Achievement with a measurable result</li></ul>
<h2>Education</h2>
<p><strong>Degree</strong>, School — Year</p>
<h2>Skills</h2>
<p>Skill, skill, skill, skill</p>`;

const html = (factory: () => string) => () => ({ html: factory().replace(/\n/g, ""), page: { ...DEFAULT_DOC_PAGE } });

export const DOC_TEMPLATES: OfficeTemplate<"document">[] = [
	{ id: "letter", labelKey: "docs.template.letter", create: html(LETTER) },
	{ id: "meeting-notes", labelKey: "docs.template.meetingNotes", create: html(MEETING_NOTES) },
	{ id: "project-proposal", labelKey: "docs.template.projectProposal", create: html(PROJECT_PROPOSAL) },
	{ id: "resume", labelKey: "docs.template.resume", create: html(RESUME) },
];
