// Everything the Notes page needs from Tiptap, bundled into one file exposed as window.IgnisTiptap.
import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import Suggestion from '@tiptap/suggestion';

window.IgnisTiptap = { Editor, Extension, StarterKit, Highlight, TaskList, TaskItem, Placeholder, Suggestion };
