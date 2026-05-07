import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Bold, Italic, List, ListOrdered } from 'lucide-react'
import { useEffect, useState } from 'react'

function ToolbarBtn({ onClick, active, icon, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        active
          ? 'bg-primary text-white'
          : 'text-text-secondary hover:text-text-primary hover:bg-border/50'
      }`}
    >
      {icon}
    </button>
  )
}

export function RichTextEditor({ value, onChange, placeholder, minRows = 6 }) {
  const [isEmpty, setIsEmpty] = useState(!value)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const empty = editor.isEmpty
      setIsEmpty(empty)
      onChange(empty ? '' : html)
    },
    editorProps: {
      attributes: {
        class: 'px-4 py-3 font-body text-sm text-text-primary focus:outline-none',
        style: `min-height: ${minRows * 26}px`,
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const normalizedValue = value || ''
    const currentHtml = editor.getHTML()
    if (currentHtml !== normalizedValue && !(editor.isEmpty && !normalizedValue)) {
      editor.commands.setContent(normalizedValue, false)
    }
    setIsEmpty(editor.isEmpty)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="rounded-xl border-2 border-border bg-surface overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-shadow">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-background/60">
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive('bold') ?? false}
          icon={<Bold size={14} />}
          title="Bold"
        />
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive('italic') ?? false}
          icon={<Italic size={14} />}
          title="Italic"
        />
        <div className="w-px h-4 bg-border mx-1" />
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive('orderedList') ?? false}
          icon={<ListOrdered size={14} />}
          title="Numbered list"
        />
        <ToolbarBtn
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive('bulletList') ?? false}
          icon={<List size={14} />}
          title="Bullet list"
        />
      </div>

      {/* Editor */}
      <div className="relative [&_.ProseMirror]:outline-none [&_ol]:list-decimal [&_ol]:ml-5 [&_ul]:list-disc [&_ul]:ml-5 [&_li]:mb-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_strong]:font-bold [&_em]:italic">
        <EditorContent editor={editor} />
        {isEmpty && placeholder && (
          <span className="absolute top-3 left-4 text-sm text-text-secondary/50 font-body pointer-events-none select-none">
            {placeholder}
          </span>
        )}
      </div>
    </div>
  )
}
