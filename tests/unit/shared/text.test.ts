"use strict";

import { describe, it, expect } from "bun:test";
import { truncate, escapeXml, stripMarkdown } from "../../../src/shared/text.js";

describe("truncate", () => {
  it("should return the original text when shorter than the limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("should return the original text when exactly the limit", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("should cut text and append suffix when longer than the limit", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  it("should use a custom suffix when provided", () => {
    expect(truncate("hello world", 8, "...")).toBe("hello...");
  });

  it("should handle empty strings", () => {
    expect(truncate("", 5)).toBe("");
  });
});

describe("escapeXml", () => {
  it("should escape ampersands", () => {
    expect(escapeXml("a & b")).toBe("a &amp; b");
  });

  it("should escape less-than and greater-than", () => {
    expect(escapeXml("<tag>")).toBe("&lt;tag&gt;");
  });

  it("should escape double quotes", () => {
    expect(escapeXml('say "hello"')).toBe("say &quot;hello&quot;");
  });

  it("should escape single quotes", () => {
    expect(escapeXml("it's")).toBe("it&apos;s");
  });

  it("should escape all special characters in one pass", () => {
    expect(escapeXml("<a href=\"url\" title='tip'>&co</a>")).toBe(
      "&lt;a href=&quot;url&quot; title=&apos;tip&apos;&gt;&amp;co&lt;/a&gt;",
    );
  });

  it("should leave plain text unchanged", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});

describe("stripMarkdown", () => {
  it("should remove bold markers", () => {
    expect(stripMarkdown("**bold** text")).toBe("bold text");
  });

  it("should remove italic markers", () => {
    expect(stripMarkdown("*italic* text")).toBe("italic text");
  });

  it("should remove inline code backticks", () => {
    expect(stripMarkdown("use `code` here")).toBe("use code here");
  });

  it("should remove links and keep link text", () => {
    expect(stripMarkdown("[click](https://example.com)")).toBe("click");
  });

  it("should remove headers", () => {
    const result = stripMarkdown("## Section Title\ncontent");
    expect(result).toBe("Section Title\ncontent");
  });

  it("should remove blockquote markers", () => {
    const result = stripMarkdown("> quoted text\n> more quote");
    expect(result).toBe("quoted text\nmore quote");
  });

  it("should handle mixed Markdown inline formatting", () => {
    const md = "**bold** and *italic* and `code`";
    expect(stripMarkdown(md)).toBe("bold and italic and code");
  });
});
