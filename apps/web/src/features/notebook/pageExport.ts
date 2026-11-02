import type { JSONContent } from '@tiptap/react'
import { computedProperty, automaticPropertyTypes } from './taskProperties.ts'
import type { PersonalList } from './personalLists.ts'
import type { Page } from './notebookModel'
const escape = (text: string) => text.replace(/([\\`*_{}\[\]<>#])/g, '\\$1')
function inline(node: JSONContent): string {
  if (node.type === 'hardBreak') return '  \n'
  if (node.type !== 'text') return (node.content || []).map(inline).join('')
  let text = escape(node.text || '')
  for (const mark of node.marks || []) {
    if (mark.type === 'bold') text = `**${text}**`
    if (mark.type === 'italic') text = `*${text}*`
    if (mark.type === 'strike') text = `~~${text}~~`
    if (mark.type === 'code') text = `\`${(node.text || '').replace(/`/g, '\\`')}\``
    if (mark.type === 'link' && /^(https?:|mailto:)/i.test(mark.attrs?.href || '')) text = `[${text}](${String(mark.attrs?.href).replace(/[()\s]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)})`
  }
  return text
}
function block(node: JSONContent): string {
  const children = node.content || []
  switch (node.type) {
    case 'doc': return children.map(block).join('\n\n')
    case 'imageGrid': return (node.attrs?.images || []).filter(Boolean).map((image: { url: string; alt: string }) => `![${escape(image.alt)}](${image.url.replace(/[()\s]/g, (c: string) => encodeURIComponent(c))})`).join('\n\n')
    case 'viewBlock': {
      const items = node.attrs?.exportItems
      if (Array.isArray(items)) {
        const cell = (value: unknown) => escape(String(value ?? '—')).replace(/\|/g, '\\|').replace(/\n/g, ' ')
        const properties = (node.attrs?.exportProperties || []) as Array<{ id: string; name: string }>
        const extraHeaders = properties.length ? ` ${properties.map(p => cell(p.name)).join(' | ')} |` : ''
        const extraDividers = properties.length ? ` ${properties.map(() => '---').join(' | ')} |` : ''
        return `### ${escape(node.attrs?.title || node.attrs?.exportName || 'My list')}\n\n| Name | Status | Date | Value | Description | Image |${extraHeaders}\n| --- | --- | --- | --- | --- | --- |${extraDividers}\n${items.map(item => `| ${[item.title, item.status, item.date, item.value, item.description, item.cover, ...properties.map(p => item.properties?.[p.id])].map(cell).join(' | ')} |`).join('\n')}`
      }
      return `### ${escape(node.attrs?.title || 'Ignis view')}\n\n${escape(node.attrs?.view || 'table')} view of ${escape(node.attrs?.source || 'list')}.`
    }
    case 'columns': return children.map((column, index) => `<!-- Column ${index + 1} -->\n\n${block(column)}`).join('\n\n')
    case 'tabPanel': return `### ${escape(node.attrs?.title || 'Untitled tab')}\n\n${children.map(block).join('\n\n')}`
    case 'tableOfContents': return (node.attrs?.outline || []).map((heading: { title: string; level: number }) => `${'  '.repeat(Math.min(heading.level, 4) - 1)}- ${escape(heading.title)}`).join('\n') || '<!-- Table of contents: add headings -->'
    case 'paragraph': return inline(node)
    case 'heading': return `${'#'.repeat(Math.max(1, Math.min(6, Number(node.attrs?.level) || 1)))} ${inline(node)}`
    case 'pageLink': return `[${escape(node.attrs?.title || 'Untitled')}](#page=${encodeURIComponent(node.attrs?.pageId || '')})`
    case 'callout': return children.map(block).join('\n\n').split('\n').map(line => `> ${line}`).join('\n')
    case 'details': {
      const level = children[0]?.attrs?.headingLevel
      const text = (children[0]?.content?.map(n => n.text || '').join('') || 'Toggle').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const title = [1, 2, 3].includes(level) ? `<h${level}>${text}</h${level}>` : text
      return `<details>\n<summary>${title}</summary>\n\n${children.slice(1).map(block).join('\n\n')}\n\n</details>`
    }
    case 'table': {
      const rows = children.map(row => `| ${(row.content || []).map(cell => (cell.content || []).map(block).join(' ').replace(/\|/g, '\\|').replace(/\n/g, '<br>')).join(' | ')} |`)
      if (rows.length) rows.splice(1, 0, `| ${(children[0].content || []).map(() => '---').join(' | ')} |`)
      return rows.join('\n')
    }
    case 'blockquote': return children.map(block).join('\n\n').split('\n').map(line => `> ${line}`).join('\n')
    case 'codeBlock': {
      const text = children.map(n => n.text || '').join('')
      const fence = '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(match => match[0].length + 1)))
      return `${fence}\n${text}\n${fence}`
    }
    case 'horizontalRule': return '---'
    case 'image': return `![${escape(node.attrs?.alt || '')}](${String(node.attrs?.src || '').replace(/[()\s]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)})`
    case 'bulletList': case 'orderedList': case 'taskList': return children.map((item, index) => {
      const prefix = node.type === 'orderedList' ? `${(Number(node.attrs?.start) || 1) + index}. ` : node.type === 'taskList' ? `- [${item.attrs?.checked ? 'x' : ' '}] ` : '- '
      const lines = (item.content || []).map(block).join('\n').split('\n')
      return prefix + lines.map((line, i) => i ? ' '.repeat(prefix.length) + line : line).join('\n')
    }).join('\n')
    default: return children.map(block).join('\n\n')
  }
}
export function pageMarkdown(page: Page, pages: Page[] = []): string {
  const headings: Array<{ title: string; level: number }> = []
  const collectHeadings = (node: JSONContent) => {
    const level = node.type === 'heading' ? node.attrs?.level : node.type === 'detailsSummary' ? node.attrs?.headingLevel : null
    if (level) { const text = (node.content || []).map(child => child.text || '').join(''); if (text.trim()) headings.push({ title: text, level }) }
    node.content?.forEach(collectHeadings)
  }
  collectHeadings(page.content)
  const referenced = new Set<string>()
  const collections = [...pages, page].flatMap(source => source.lists || [])
  const exportItems = (list: PersonalList) => list.items.map(item => ({ ...item, properties: Object.fromEntries((list.properties || []).map(property => {
    let value = item.properties?.[property.id] ?? null
    try {
      if (automaticPropertyTypes.includes(property.type)) value = property.type === 'button' ? null : computedProperty(property, item, list, collections)
      if (property.type === 'relation' && Array.isArray(value)) { const source = collections.find(l => l.id === property.config?.targetListId) || (!property.config?.targetListId ? list : undefined); value = value.map(id => source?.items.find(t => t.id === id)?.title || 'Unavailable task') }
    } catch { value = 'Calculation unavailable' }
    return [property.id, value]
  })) }))
  const resolve = (node: JSONContent): JSONContent => ({ ...node,
    ...(node.type === 'viewBlock' && node.attrs?.source === 'list' ? (() => { const list = collections.find(list => list.id === node.attrs?.collectionId); if (list) referenced.add(list.id); return { attrs: { ...node.attrs, exportItems: list ? exportItems(list) : undefined, exportProperties: list?.properties, exportName: list?.name } } })() : {}),
    ...(node.type === 'tableOfContents' ? { attrs: { outline: headings } } : {}),
    ...(node.type === 'pageLink' ? { attrs: { ...node.attrs, title: pages.find(p => p.id === node.attrs?.pageId)?.title || node.attrs?.title || 'Untitled' } } : {}),
    ...(node.content ? { content: node.content.map(resolve) } : {}),
  })
  const body = block(resolve(page.content)).trim()
  const remaining = (page.lists || []).filter(list => !referenced.has(list.id)).map(list => block({ type: 'viewBlock', attrs: { exportItems: exportItems(list), exportProperties: list.properties, exportName: list.name } })).join('\n\n')
  return `# ${escape(page.title.trim() || 'Untitled')}\n\n${body}${remaining ? `\n\n${remaining}` : ''}\n`
}
