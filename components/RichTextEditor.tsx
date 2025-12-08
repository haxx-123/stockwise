
import React, { useRef, useEffect } from 'react';

interface RichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange }) => {
    const editorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (editorRef.current && editorRef.current.innerHTML !== value) {
            editorRef.current.innerHTML = value;
        }
    }, []); // Only init

    const exec = (command: string, value: string | undefined = undefined) => {
        document.execCommand(command, false, value);
        if (editorRef.current) onChange(editorRef.current.innerHTML);
    };

    const insertImage = () => {
        const url = prompt("请输入图片链接 (URL):");
        if (url) exec('insertImage', url);
    };

    const insertTable = () => {
        const html = '<table border="1" style="width:100%; border-collapse: collapse; margin: 10px 0;"><tbody><tr><td style="padding:5px; border:1px solid #ccc;">内容</td><td style="padding:5px; border:1px solid #ccc;">内容</td></tr><tr><td style="padding:5px; border:1px solid #ccc;">内容</td><td style="padding:5px; border:1px solid #ccc;">内容</td></tr></tbody></table><br/>';
        exec('insertHTML', html);
    };

    return (
        <div className="border rounded-lg dark:border-gray-700 overflow-hidden flex flex-col h-80 bg-white dark:bg-gray-800">
            <div className="bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-700 p-2 flex flex-wrap gap-2 items-center">
                <button onClick={() => exec('bold')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded font-bold dark:text-gray-300" title="加粗">B</button>
                <button onClick={() => exec('italic')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded italic dark:text-gray-300" title="斜体">I</button>
                <button onClick={() => exec('underline')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded underline dark:text-gray-300" title="下划线">U</button>
                <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                <button onClick={() => exec('fontSize', '5')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-lg dark:text-gray-300" title="大字号">A+</button>
                <button onClick={() => exec('fontSize', '3')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-sm dark:text-gray-300" title="正常">A</button>
                <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                <button onClick={() => exec('foreColor', '#EF4444')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-red-500 font-bold" title="红字">A</button>
                <button onClick={() => exec('foreColor', '#10B981')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-green-500 font-bold" title="绿字">A</button>
                <button onClick={() => exec('foreColor', '#000000')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-black font-bold" title="黑字">A</button>
                <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1"></div>
                <button onClick={insertImage} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex items-center gap-1 dark:text-gray-300" title="插入图片">🖼️</button>
                <button onClick={insertTable} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex items-center gap-1 dark:text-gray-300" title="插入表格">📅</button>
            </div>
            <div 
                ref={editorRef}
                contentEditable 
                className="flex-1 p-4 outline-none overflow-y-auto custom-scrollbar dark:text-white prose dark:prose-invert max-w-none"
                onInput={(e) => onChange(e.currentTarget.innerHTML)}
                onBlur={(e) => onChange(e.currentTarget.innerHTML)}
            />
        </div>
    );
};
