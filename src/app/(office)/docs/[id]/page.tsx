"use client";

import { use } from "react";
import { OfficeEditorPage } from "@/components/office/office-editor-page";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);
	return <OfficeEditorPage key={id} id={id} kind="document" />;
}
