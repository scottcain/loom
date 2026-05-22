import { describe, it, expect, vi, beforeEach } from "vitest";
import * as pagesApi from "../extensions/loom/galaxy-pages-api";
import * as galaxyApi from "../extensions/loom/galaxy-api";
import * as notebookWriter from "../extensions/loom/notebook-writer";
import * as state from "../extensions/loom/state";
import {
    pushNotebookToGalaxy,
    pullNotebookFromGalaxy,
    linkGalaxyPage,
} from "../extensions/loom/galaxy-pages-sync";

vi.mock("../extensions/loom/galaxy-pages-api");
vi.mock("../extensions/loom/galaxy-api");
vi.mock("../extensions/loom/notebook-writer", async (importOriginal) => {
    const actual = await importOriginal<typeof notebookWriter>();
    return {
        ...actual,
        readNotebook: vi.fn(),
        writeNotebook: vi.fn(),
        withNotebookLock: vi.fn(async (_p: string, fn: () => Promise<unknown>) => fn()),
    };
});
vi.mock("../extensions/loom/state");

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(state.getNotebookPath).mockReturnValue("/work/notebook.md");
    vi.mocked(galaxyApi.getGalaxyConfig).mockReturnValue({
        url: "https://galaxy.example",
        apiKey: "k",
    });
    vi.mocked(notebookWriter.withNotebookLock).mockImplementation(
        async (_p: string, fn: () => Promise<unknown>) => fn() as Promise<never>,
    );
});

describe("pushNotebookToGalaxy", () => {
    it("creates a new page when notebook has no binding", async () => {
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue(
            "# Analysis\n\nBody content.\n",
        );
        vi.mocked(pagesApi.createPage).mockResolvedValue({
            id: "p1",
            slug: "analysis",
            latest_revision_id: "r1",
            revision_ids: ["r1"],
            title: "Analysis",
            create_time: "2026-05-20T00:00:00Z",
            update_time: "2026-05-20T00:00:00Z",
        });

        const result = await pushNotebookToGalaxy({
            historyId: "h1",
            title: "Analysis",
        });

        expect(pagesApi.createPage).toHaveBeenCalledWith({
            history_id: "h1",
            title: "Analysis",
            slug: undefined,
            annotation: undefined,
            content: "# Analysis\n\nBody content.\n",
            content_format: "markdown",
        });
        expect(result).toEqual({
            pageId: "p1",
            pageSlug: "analysis",
            latestRevisionId: "r1",
            action: "created",
        });
        expect(notebookWriter.writeNotebook).toHaveBeenCalledOnce();
        const written = vi.mocked(notebookWriter.writeNotebook).mock
            .calls[0][1];
        expect(written).toContain("```loom-galaxy-page");
        expect(written).toContain("page_id: p1");
        expect(written).toContain("last_synced_revision: r1");
    });

    it("updates the existing page when a binding is present", async () => {
        const initial = [
            "# Analysis",
            "",
            "Body content.",
            "",
            "```loom-galaxy-page",
            "page_id: p1",
            "page_slug: analysis",
            'galaxy_server_url: "https://galaxy.example"',
            "history_id: h1",
            "last_synced_revision: r1",
            "bound_at: 2026-05-20T10:00:00Z",
            "```",
            "",
        ].join("\n");
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue(initial);
        vi.mocked(pagesApi.updatePage).mockResolvedValue({
            id: "p1",
            slug: "analysis",
            latest_revision_id: "r2",
            revision_ids: ["r1", "r2"],
            title: "Analysis",
            create_time: "2026-05-20T00:00:00Z",
            update_time: "2026-05-21T00:00:00Z",
        });

        const result = await pushNotebookToGalaxy();

        expect(pagesApi.updatePage).toHaveBeenCalledWith(
            "p1",
            expect.objectContaining({
                content: expect.not.stringContaining("loom-galaxy-page"),
                content_format: "markdown",
                edit_source: "agent",
            }),
        );
        expect(result).toEqual({
            pageId: "p1",
            pageSlug: "analysis",
            latestRevisionId: "r2",
            action: "updated",
        });
        const written = vi.mocked(notebookWriter.writeNotebook).mock.calls.at(
            -1,
        )![1];
        expect(written).toContain("last_synced_revision: r2");
    });

    it("throws on server-URL mismatch before calling Galaxy", async () => {
        const initial = [
            "```loom-galaxy-page",
            "page_id: p1",
            "page_slug: a",
            'galaxy_server_url: "https://other.example"',
            "history_id: h1",
            "last_synced_revision: r1",
            "bound_at: 2026-05-20T10:00:00Z",
            "```",
            "",
        ].join("\n");
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue(initial);

        await expect(pushNotebookToGalaxy()).rejects.toThrow(
            /bound to.*other\.example.*connected to.*galaxy\.example/,
        );
        expect(pagesApi.updatePage).not.toHaveBeenCalled();
    });
});

describe("pullNotebookFromGalaxy", () => {
    it("throws when notebook has no binding", async () => {
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue(
            "# No binding here\n",
        );
        await expect(pullNotebookFromGalaxy()).rejects.toThrow(
            /not bound to a Galaxy page/,
        );
        expect(pagesApi.getPage).not.toHaveBeenCalled();
    });

    it("throws on server-URL mismatch", async () => {
        const bound = [
            "```loom-galaxy-page",
            "page_id: p1",
            "page_slug: a",
            'galaxy_server_url: "https://other.example"',
            "history_id: h1",
            "last_synced_revision: r1",
            "bound_at: 2026-05-20T10:00:00Z",
            "```",
            "",
        ].join("\n");
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue(bound);
        await expect(pullNotebookFromGalaxy()).rejects.toThrow(
            /bound to.*other\.example.*connected to.*galaxy\.example/,
        );
        expect(pagesApi.getPage).not.toHaveBeenCalled();
    });

    it("replaces notebook with remote body and re-applies binding with new revision", async () => {
        const bound = [
            "Some local edits.",
            "",
            "```loom-galaxy-page",
            "page_id: p1",
            "page_slug: a",
            'galaxy_server_url: "https://galaxy.example"',
            "history_id: h1",
            "last_synced_revision: r1",
            "bound_at: 2026-05-20T10:00:00Z",
            "```",
            "",
        ].join("\n");
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue(bound);
        vi.mocked(pagesApi.getPage).mockResolvedValue({
            id: "p1",
            slug: "a",
            latest_revision_id: "r2",
            revision_ids: ["r1", "r2"],
            title: "A",
            content: "# Remote body\n\nUpdated server-side.\n",
            content_format: "markdown",
            create_time: "2026-05-20T00:00:00Z",
            update_time: "2026-05-21T00:00:00Z",
        });

        const result = await pullNotebookFromGalaxy();

        expect(pagesApi.getPage).toHaveBeenCalledWith("p1");
        expect(result).toEqual({ pageId: "p1", latestRevisionId: "r2" });
        const written = vi.mocked(notebookWriter.writeNotebook).mock.calls.at(
            -1,
        )![1];
        expect(written).toContain("# Remote body");
        expect(written).toContain("Updated server-side.");
        expect(written).not.toContain("Some local edits.");
        expect(written).toContain("```loom-galaxy-page");
        expect(written).toContain("last_synced_revision: r2");
    });
});

describe("linkGalaxyPage", () => {
    it("inserts a binding block from a getPage response", async () => {
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue(
            "# Notebook\n\nNo binding yet.\n",
        );
        vi.mocked(pagesApi.getPage).mockResolvedValue({
            id: "p7",
            slug: "linked-page",
            latest_revision_id: "r3",
            revision_ids: ["r3"],
            title: "Linked",
            content: "ignored",
            content_format: "markdown",
            history_id: "h7",
            create_time: "2026-05-20T00:00:00Z",
            update_time: "2026-05-20T00:00:00Z",
        });

        const result = await linkGalaxyPage("p7");

        expect(pagesApi.getPage).toHaveBeenCalledWith("p7");
        expect(result).toEqual({ pageId: "p7", latestRevisionId: "r3" });
        const written = vi.mocked(notebookWriter.writeNotebook).mock.calls.at(
            -1,
        )![1];
        expect(written).toContain("page_id: p7");
        expect(written).toContain("page_slug: linked-page");
        expect(written).toContain("history_id: h7");
        expect(written).toContain("# Notebook");
    });

    it("requires explicit history_id when the page response doesn't carry one", async () => {
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue("# Notebook\n");
        vi.mocked(pagesApi.getPage).mockResolvedValue({
            id: "p8",
            slug: "no-hist",
            latest_revision_id: "r4",
            revision_ids: ["r4"],
            title: "NoHist",
            content: "",
            content_format: "markdown",
            create_time: "2026-05-20T00:00:00Z",
            update_time: "2026-05-20T00:00:00Z",
        });

        await expect(linkGalaxyPage("p8")).rejects.toThrow(/history_id/);
    });

    it("uses provided history_id when caller supplies one", async () => {
        vi.mocked(notebookWriter.readNotebook).mockResolvedValue("# Notebook\n");
        vi.mocked(pagesApi.getPage).mockResolvedValue({
            id: "p9",
            slug: "x",
            latest_revision_id: "r5",
            revision_ids: ["r5"],
            title: "X",
            content: "",
            content_format: "markdown",
            create_time: "2026-05-20T00:00:00Z",
            update_time: "2026-05-20T00:00:00Z",
        });

        const result = await linkGalaxyPage("p9", { historyId: "h9-explicit" });

        expect(result.pageId).toBe("p9");
        const written = vi.mocked(notebookWriter.writeNotebook).mock.calls.at(
            -1,
        )![1];
        expect(written).toContain("history_id: h9-explicit");
    });
});
