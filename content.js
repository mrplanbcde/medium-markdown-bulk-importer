(function () {
  function escapeHtml(value) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseInline(text) {
    if (!text) return '';

    let out = escapeHtml(text);

    out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+\"([^\"]+)\")?\)/g, (_, alt, src, title) => {
      const titleAttr = title ? ` title=\"${escapeHtml(title)}\"` : '';
      return `<img src=\"${escapeHtml(src)}\" alt=\"${escapeHtml(alt)}\"${titleAttr} />`;
    });

    out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+\"([^\"]+)\")?\)/g, (_, label, href, title) => {
      const titleAttr = title ? ` title=\"${escapeHtml(title)}\"` : '';
      return `<a href=\"${escapeHtml(href)}\"${titleAttr}>${label}</a>`;
    });

    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    out = out.replace(/_([^_]+)_/g, '<em>$1</em>');

    return out;
  }

  function markdownToHtml(markdown) {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const html = [];

    let inCodeBlock = false;
    let codeLang = '';
    let listType = null;
    let paragraph = [];
    let skippedFirstH1 = false;

    function closeParagraph() {
      if (paragraph.length) {
        html.push(`<p>${parseInline(paragraph.join(' ').trim())}</p>`);
        paragraph = [];
      }
    }

    function closeList() {
      if (listType) {
        html.push(listType === 'ul' ? '</ul>' : '</ol>');
        listType = null;
      }
    }

    for (const rawLine of lines) {
      const line = rawLine || '';
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        closeParagraph();
        closeList();

        if (!inCodeBlock) {
          codeLang = trimmed.slice(3).trim();
          const className = codeLang ? ` class=\"language-${escapeHtml(codeLang)}\"` : '';
          html.push(`<pre><code${className}>`);
          inCodeBlock = true;
        } else {
          html.push('</code></pre>');
          inCodeBlock = false;
          codeLang = '';
        }
        continue;
      }

      if (inCodeBlock) {
        html.push(`${escapeHtml(line)}\n`);
        continue;
      }

      if (!trimmed) {
        closeParagraph();
        closeList();
        continue;
      }

      if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
        closeParagraph();
        closeList();
        html.push('<hr />');
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        closeParagraph();
        closeList();
        const rawLevel = Math.min(6, headingMatch[1].length);
        const headingText = headingMatch[2].trim();

        // Medium already has a dedicated title field. Skip the first H1 in body.
        if (!skippedFirstH1 && rawLevel === 1) {
          skippedFirstH1 = true;
          continue;
        }

        // Keep imported text easy to edit and less visually aggressive in Medium.
        html.push(`<p><strong>${parseInline(headingText)}</strong></p>`);
        continue;
      }

      const quoteMatch = trimmed.match(/^>\s?(.*)$/);
      if (quoteMatch) {
        closeParagraph();
        closeList();
        html.push(`<blockquote><p>${parseInline(quoteMatch[1])}</p></blockquote>`);
        continue;
      }

      const ulMatch = trimmed.match(/^[-*+]\s+(.+)$/);
      if (ulMatch) {
        closeParagraph();
        if (listType !== 'ul') {
          closeList();
          html.push('<ul>');
          listType = 'ul';
        }
        html.push(`<li>${parseInline(ulMatch[1])}</li>`);
        continue;
      }

      const olMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (olMatch) {
        closeParagraph();
        if (listType !== 'ol') {
          closeList();
          html.push('<ol>');
          listType = 'ol';
        }
        html.push(`<li>${parseInline(olMatch[1])}</li>`);
        continue;
      }

      paragraph.push(trimmed);
    }

    closeParagraph();
    closeList();

    if (inCodeBlock) {
      html.push('</code></pre>');
    }

    return html.join('');
  }

  function extractTitle(markdown) {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const h1 = trimmed.match(/^#\s+(.+)$/);
      if (h1) {
        return h1[1].trim();
      }

      // Fallback: first non-empty line with markdown markers stripped.
      return trimmed
        .replace(/^#{1,6}\s+/, '')
        .replace(/^[-*+]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .trim();
    }

    return 'Untitled';
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getEditableTarget(el) {
    if (!el) return null;
    if (el.matches('textarea, input')) return el;
    if (el.isContentEditable || el.matches('[contenteditable], [role="textbox"]')) return el;
    return el.querySelector('[contenteditable], [role="textbox"], textarea, input');
  }

  function getVisibleEditableTargets() {
    const raw = Array.from(document.querySelectorAll('[contenteditable], [role="textbox"], textarea, input'));
    const seen = new Set();
    const targets = [];

    for (const node of raw) {
      const target = getEditableTarget(node);
      if (!target || !isVisible(target) || seen.has(target)) continue;
      seen.add(target);
      targets.push(target);
    }

    return targets;
  }

  function findTitleEditor() {
    const selectors = [
      '[contenteditable][data-placeholder*="Title" i]',
      '[contenteditable][aria-label*="Title" i]',
      '[role="textbox"][aria-label*="Title" i]',
      '[data-placeholder*="Title" i]',
      'h1'
    ];

    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      const node = nodes.find((el) => isVisible(el) && getEditableTarget(el));
      if (node) return getEditableTarget(node);
    }

    const editables = getVisibleEditableTargets();

    if (!editables.length) return null;

    editables.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    return getEditableTarget(editables[0]);
  }

  function findBodyEditor(titleEditor) {
    const titleRect = titleEditor ? titleEditor.getBoundingClientRect() : null;
    const candidates = getVisibleEditableTargets();

    const scored = candidates
      .filter((el) => !!el && el !== titleEditor)
      .map((el) => {
        const attrs = `${el.getAttribute('data-placeholder') || ''} ${el.getAttribute('aria-label') || ''}`;
        const text = (el.textContent || '').trim();
        const rect = el.getBoundingClientRect();
        let score = 0;
        if (/Tell your story/i.test(attrs)) score += 10;
        if (/story|editor|body|post/i.test(attrs)) score += 4;
        if (text.length < 5) score += 1;
        if (titleRect && rect.top > titleRect.bottom) score += 3;
        return { el, score };
      })
      .sort((a, b) => b.score - a.score);

    if (scored.length) {
      return scored[0].el;
    }

    // Fallback: second editable field on page is usually body.
    const byTop = [...candidates].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    if (byTop.length >= 2) {
      return byTop[1];
    }

    return null;
  }

  function selectAllInElement(el) {
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function replaceEditableText(el, text) {
    el.focus();
    if (el.matches('textarea, input')) {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    selectAllInElement(el);
    if (!document.execCommand('insertText', false, text)) {
      el.textContent = text;
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }

  function replaceEditableHtml(el, html) {
    el.focus();
    if (el.matches('textarea, input')) {
      el.value = html.replace(/<[^>]+>/g, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    selectAllInElement(el);
    const deleted = document.execCommand('delete', false);
    const inserted = document.execCommand('insertHTML', false, html);
    if (!deleted || !inserted) {
      // Avoid direct innerHTML writes: they can break Medium's internal editor state.
      const fallbackText = html
        .replace(/<\/p>\s*<p>/g, '\n\n')
        .replace(/<li>/g, '- ')
        .replace(/<\/li>/g, '\n')
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<[^>]+>/g, '')
        .trim();
      document.execCommand('insertText', false, fallbackText);
    }

    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }

  async function waitForEditors(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const titleEditor = findTitleEditor();
      const bodyEditor = findBodyEditor(titleEditor);
      if (titleEditor && bodyEditor) {
        return { titleEditor, bodyEditor };
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    const titleEditor = findTitleEditor();
    const bodyEditor = findBodyEditor(titleEditor);
    return { titleEditor, bodyEditor };
  }

  async function importMarkdownToMedium(markdown) {
    const title = extractTitle(markdown);
    const bodyHtml = markdownToHtml(markdown);
    const { titleEditor, bodyEditor } = await waitForEditors();

    if (!titleEditor || !bodyEditor) {
      const editableCount = document.querySelectorAll('[contenteditable="true"], textarea, input').length;
      throw new Error(`Could not find Medium title/body editor (detected editable nodes: ${editableCount}). Click into the draft once and retry.`);
    }

    replaceEditableText(titleEditor, title);
    replaceEditableHtml(bodyEditor, bodyHtml);

    return { title, htmlLength: bodyHtml.length };
  }

  async function prepareMediumForPaste(title) {
    const { titleEditor, bodyEditor } = await waitForEditors();
    if (!bodyEditor) {
      const editableCount = document.querySelectorAll('[contenteditable], [role="textbox"], textarea, input').length;
      throw new Error(`Could not find Medium body editor (editable nodes: ${editableCount}). Open https://medium.com/new-story and click into the body once.`);
    }

    if (titleEditor && titleEditor === bodyEditor) {
      throw new Error('Editor detection conflict: title and body are the same node. Click "Tell your story..." once and retry.');
    }

    replaceEditableText(bodyEditor, '');
    bodyEditor.focus();
    return true;
  }

  async function tryPasteFromClipboard() {
    const { titleEditor, bodyEditor } = await waitForEditors();
    if (!titleEditor || !bodyEditor) {
      throw new Error('Could not focus Medium body editor for paste.');
    }

    bodyEditor.focus();
    const pasted = !!document.execCommand('paste', false);
    bodyEditor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return pasted;
  }

  async function setMediumTitle(title) {
    const { titleEditor, bodyEditor } = await waitForEditors();
    if (!titleEditor) {
      throw new Error('Could not find Medium title editor.');
    }
    if (titleEditor === bodyEditor) {
      throw new Error('Editor detection conflict: title and body are the same node.');
    }

    replaceEditableText(titleEditor, title || 'Untitled');
    return true;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.action) {
      return;
    }

    (async () => {
      try {
        if (message.action === 'PREPARE_MEDIUM_FOR_PASTE') {
          const title = String(message.title || 'Untitled');
          await prepareMediumForPaste(title);
          sendResponse({ ok: true });
          return;
        }

        if (message.action === 'TRY_PASTE_FROM_CLIPBOARD') {
          const pasted = await tryPasteFromClipboard();
          sendResponse({ ok: true, pasted });
          return;
        }

        if (message.action === 'SET_MEDIUM_TITLE') {
          const title = String(message.title || 'Untitled');
          await setMediumTitle(title);
          sendResponse({ ok: true });
          return;
        }

        if (message.action === 'IMPORT_MARKDOWN_TO_MEDIUM') {
          const markdown = String(message.markdown || '');
          if (!markdown.trim()) {
            throw new Error('Markdown file is empty.');
          }

          const result = await importMarkdownToMedium(markdown);
          sendResponse({ ok: true, result });
          return;
        }

        sendResponse({ ok: false, error: 'Unsupported action.' });
      } catch (error) {
        sendResponse({ ok: false, error: error.message || 'Import failed.' });
      }
    })();

    return true;
  });
})();
