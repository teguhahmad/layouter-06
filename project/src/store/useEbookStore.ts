import { create } from 'zustand';
import type { Chapter, EbookSettings } from '../types';
import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { parsePDFMarkdown } from '../utils/pdfMarkdownParser';

interface EbookStore {
  chapters: Chapter[];
  settings: EbookSettings;
  addChapter: (chapter: Partial<Chapter>) => void;
  updateChapter: (id: string, chapter: Partial<Chapter>) => void;
  removeChapter: (id: string) => void;
  reorderChapters: (chapters: Chapter[]) => void;
  updateSettings: (settings: Partial<EbookSettings>) => void;
  calculatePageNumbers: () => void;
  addSubChapter: (chapterId: string, title: string) => void;
  removeSubChapter: (chapterId: string, subChapterId: string) => void;
  generatePDF: () => Promise<Blob>;
}

const defaultSettings: EbookSettings = {
  title: '',
  author: '',
  description: '',
  coverImage: null,
  backCoverImage: null,
  paperSize: 'A4',
  margins: {
    top: 2.54,
    bottom: 2.54,
    left: 2.54,
    right: 2.54,
  },
  fonts: {
    title: {
      family: 'Helvetica',
      size: 24,
      alignment: 'center',
      lineHeight: 1.5,
    },
    subtitle: {
      family: 'Helvetica',
      size: 18,
      alignment: 'left',
      lineHeight: 1.5,
    },
    paragraph: {
      family: 'Helvetica',
      size: 12,
      alignment: 'justify',
      lineHeight: 1.5,
    },
    header: {
      family: 'Helvetica',
      size: 10,
      alignment: 'center',
      lineHeight: 1.2,
    },
    footer: {
      family: 'Helvetica',
      size: 10,
      alignment: 'center',
      lineHeight: 1.2,
    },
    frontmatterContent: {
      family: 'Helvetica',
      size: 12,
      alignment: 'justify',
      lineHeight: 1.5,
    },
    chapterContent: {
      family: 'Helvetica',
      size: 12,
      alignment: 'justify',
      lineHeight: 1.5,
    },
    subchapterContent: {
      family: 'Helvetica',
      size: 12,
      alignment: 'justify',
      lineHeight: 1.5,
    },
    backmatterContent: {
      family: 'Helvetica',
      size: 12,
      alignment: 'justify',
      lineHeight: 1.5,
    },
    tocContent: {
      family: 'Helvetica',
      size: 12,
      alignment: 'left',
      lineHeight: 1.5,
    },
  },
  pageNumbering: {
    enabled: true,
    startFrom: 1,
    position: 'bottom',
    alignment: 'center',
    style: 'decimal',
  },
  header: {
    enabled: false,
    text: '',
    alternateEvenOdd: false,
  },
  footer: {
    enabled: false,
    text: '',
    alternateEvenOdd: false,
  },
};

export const useEbookStore = create<EbookStore>((set, get) => ({
  chapters: [],
  settings: defaultSettings,
  addChapter: (chapter) =>
    set((state) => {
      const newChapter = {
        id: crypto.randomUUID(),
        title: chapter.title || 'New Chapter',
        content: chapter.content || '',
        images: chapter.images || [],
        type: chapter.type || 'chapter',
        indentation: chapter.indentation || 0,
        lineSpacing: chapter.lineSpacing || 1.5,
        subChapters: chapter.subChapters || [],
      };

      const updatedChapters = [...state.chapters];
      let insertIndex = 0;

      if (newChapter.type === 'frontmatter' || newChapter.type === 'toc') {
        while (insertIndex < updatedChapters.length && 
          (updatedChapters[insertIndex].type === 'frontmatter' || updatedChapters[insertIndex].type === 'toc')) {
          insertIndex++;
        }
      } else if (newChapter.type === 'chapter') {
        while (insertIndex < updatedChapters.length && 
          (updatedChapters[insertIndex].type === 'frontmatter' || updatedChapters[insertIndex].type === 'toc')) {
          insertIndex++;
        }
        while (insertIndex < updatedChapters.length && updatedChapters[insertIndex].type === 'chapter') {
          insertIndex++;
        }
      } else {
        insertIndex = updatedChapters.length;
      }

      updatedChapters.splice(insertIndex, 0, newChapter);

      let chapterNumber = 1;
      const finalChapters = updatedChapters.map(ch => {
        if (ch.type === 'chapter') {
          return { ...ch, pageNumber: chapterNumber++ };
        }
        return ch;
      });

      return { chapters: finalChapters };
    }),
  updateChapter: (id, chapter) =>
    set((state) => {
      const updatedChapters = state.chapters.map((ch) =>
        ch.id === id ? { ...ch, ...chapter } : ch
      );

      let chapterNumber = 1;
      const finalChapters = updatedChapters.map(ch => {
        if (ch.type === 'chapter') {
          return { ...ch, pageNumber: chapterNumber++ };
        }
        return ch;
      });

      return { chapters: finalChapters };
    }),
  removeChapter: (id) =>
    set((state) => {
      const filteredChapters = state.chapters.filter((ch) => ch.id !== id);
      
      let chapterNumber = 1;
      const finalChapters = filteredChapters.map(ch => {
        if (ch.type === 'chapter') {
          return { ...ch, pageNumber: chapterNumber++ };
        }
        return ch;
      });

      return { chapters: finalChapters };
    }),
  reorderChapters: (chapters) => {
    const frontmatterChapters = chapters.filter(ch => ch.type === 'frontmatter');
    const tocChapters = chapters.filter(ch => ch.type === 'toc');
    const mainChapters = chapters.filter(ch => ch.type === 'chapter');
    const backmatterChapters = chapters.filter(ch => ch.type === 'backmatter');

    let chapterNumber = 1;
    const numberedMainChapters = mainChapters.map(ch => ({
      ...ch,
      pageNumber: chapterNumber++
    }));
    
    const orderedChapters = [
      ...frontmatterChapters,
      ...tocChapters,
      ...numberedMainChapters,
      ...backmatterChapters
    ];
    
    set({ chapters: orderedChapters });
    get().calculatePageNumbers();
  },
  updateSettings: (settings) =>
    set((state) => ({
      settings: { ...state.settings, ...settings },
    })),
  calculatePageNumbers: () => {
    const { chapters, settings } = get();
    let romanPageCount = 1;
    let arabicPageCount = 1;

    const pageWidth = settings.paperSize === 'A4' ? 210 : 216;
    const pageHeight = settings.paperSize === 'A4' ? 297 : 279;
    const contentWidth = pageWidth - (settings.margins.left + settings.margins.right) * 10;
    const contentHeight = pageHeight - (settings.margins.top + settings.margins.bottom) * 10;
    const charsPerLine = Math.floor(contentWidth / (settings.fonts.paragraph.size * 0.352778));
    const linesPerPage = Math.floor(contentHeight / (settings.fonts.paragraph.size * settings.fonts.paragraph.lineHeight * 0.352778));
    const charsPerPage = charsPerLine * linesPerPage;

    if (settings.coverImage) {
      arabicPageCount++;
    }

    arabicPageCount++;

    const updatedChapters = chapters.map((chapter) => {
      const isPreContent = chapter.type === 'frontmatter' || chapter.type === 'toc';
      let pageCount = isPreContent ? romanPageCount : arabicPageCount;

      if (isPreContent) {
        romanPageCount++;
      } else {
        arabicPageCount++;
      }

      const contentLength = chapter.content.length;
      const contentPages = Math.ceil(contentLength / charsPerPage);

      const imagePages = chapter.images.reduce((total, image) => {
        if (image.width > 50) {
          return total + 1;
        }
        return total + 0.5;
      }, 0);

      const totalImagePages = Math.ceil(imagePages);

      const totalPages = Math.max(1, contentPages + totalImagePages);

      if (isPreContent) {
        romanPageCount += totalPages;
      } else {
        arabicPageCount += totalPages;
      }

      const subChapters = chapter.subChapters.map((sub) => {
        const subContentLength = sub.content.length;
        const subPages = Math.max(1, Math.ceil(subContentLength / charsPerPage));
        const subPageNumber = isPreContent ? romanPageCount : arabicPageCount;

        if (isPreContent) {
          romanPageCount += subPages;
        } else {
          arabicPageCount += subPages;
        }

        return {
          ...sub,
          pageNumber: subPageNumber
        };
      });

      return {
        ...chapter,
        pageNumber: pageCount,
        subChapters
      };
    });

    set({ chapters: updatedChapters });
  },
  addSubChapter: (chapterId, title) => {
    set((state) => ({
      chapters: state.chapters.map((ch) =>
        ch.id === chapterId
          ? {
              ...ch,
              subChapters: [
                ...ch.subChapters,
                {
                  id: crypto.randomUUID(),
                  title,
                  content: '',
                },
              ],
            }
          : ch
      ),
    }));
    get().calculatePageNumbers();
  },
  removeSubChapter: (chapterId, subChapterId) => {
    set((state) => ({
      chapters: state.chapters.map((ch) =>
        ch.id === chapterId
          ? {
              ...ch,
              subChapters: ch.subChapters.filter((sub) => sub.id !== subChapterId),
            }
          : ch
      ),
    }));
    get().calculatePageNumbers();
  },
  generatePDF: async () => {
    const { settings, chapters } = get();
    const doc = new jsPDF({
      unit: 'mm',
      format: settings.paperSize,
      orientation: 'portrait',
      compress: true
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = settings.margins.left * 10;
    const marginRight = settings.margins.right * 10;
    const marginTop = settings.margins.top * 10;
    const marginBottom = settings.margins.bottom * 10;
    const contentWidth = pageWidth - marginLeft - marginRight;

    let currentY = marginTop;

    const addPageNumber = (isRoman: boolean) => {
      if (settings.pageNumbering.enabled) {
        const pageNum = isRoman 
          ? romanize(doc.getCurrentPageInfo().pageNumber)
          : doc.getCurrentPageInfo().pageNumber.toString();
        
        const x = settings.pageNumbering.alignment === 'center' 
          ? pageWidth / 2
          : settings.pageNumbering.alignment === 'right'
            ? pageWidth - marginRight
            : marginLeft;
        
        const y = settings.pageNumbering.position === 'top'
          ? marginTop - 5
          : pageHeight - (marginBottom / 2);

        doc.setFont(settings.fonts.footer.family);
        doc.setFontSize(settings.fonts.footer.size);
        doc.text(pageNum, x, y, { align: settings.pageNumbering.alignment });
      }
    };

    function romanize(num: number): string {
      if (!num || num <= 0) return '';
      
      const romanNumerals = [
        { value: 1000, numeral: 'M' },
        { value: 900, numeral: 'CM' },
        { value: 500, numeral: 'D' },
        { value: 400, numeral: 'CD' },
        { value: 100, numeral: 'C' },
        { value: 90, numeral: 'XC' },
        { value: 50, numeral: 'L' },
        { value: 40, numeral: 'XL' },
        { value: 10, numeral: 'X' },
        { value: 9, numeral: 'IX' },
        { value: 5, numeral: 'V' },
        { value: 4, numeral: 'IV' },
        { value: 1, numeral: 'I' }
      ];
      
      let result = '';
      let remaining = num;
      
      for (const { value, numeral } of romanNumerals) {
        while (remaining >= value) {
          result += numeral;
          remaining -= value;
        }
      }
      
      return result.toLowerCase();
    }

    // Title page
    doc.setFont(settings.fonts.title.family);
    doc.setFontSize(settings.fonts.title.size);
    const titleY = pageHeight / 2 - (settings.fonts.title.size * settings.fonts.title.lineHeight);
    doc.text(settings.title || 'Untitled', pageWidth / 2, titleY, { 
      align: settings.fonts.title.alignment 
    });
    
    doc.setFont(settings.fonts.subtitle.family);
    doc.setFontSize(settings.fonts.subtitle.size);
    const subtitleY = pageHeight / 2 + (settings.fonts.subtitle.size * settings.fonts.subtitle.lineHeight);
    doc.text(settings.author || '', pageWidth / 2, subtitleY, { 
      align: settings.fonts.subtitle.alignment 
    });

    // Content pages
    for (const chapter of chapters) {
      doc.addPage();
      currentY = marginTop;

      doc.setFont(settings.fonts.title.family);
      doc.setFontSize(settings.fonts.title.size);
      
      if (chapter.type === 'chapter') {
        const chapterTitle = `Bab ${chapter.pageNumber}\n${chapter.title}`;
        doc.text(chapterTitle, pageWidth / 2, currentY, { 
          align: settings.fonts.title.alignment,
          maxWidth: contentWidth
        });
      } else {
        doc.text(chapter.title, pageWidth / 2, currentY, { 
          align: settings.fonts.title.alignment 
        });
      }

      currentY += settings.fonts.title.lineHeight * settings.fonts.title.size * 0.352778;

      doc.setFont(settings.fonts.paragraph.family);
      doc.setFontSize(settings.fonts.paragraph.size);

      const paragraphs = chapter.content.split('\n\n').filter(p => p.trim());
      for (const paragraph of paragraphs) {
        if (currentY > pageHeight - marginBottom - 20) {
          addPageNumber(chapter.type === 'frontmatter' || chapter.type === 'toc');
          doc.addPage();
          currentY = marginTop;
        }

        currentY = parsePDFMarkdown(doc, paragraph, marginLeft + (chapter.indentation * 10), currentY, {
          maxWidth: contentWidth - (chapter.indentation * 10),
          align: settings.fonts.paragraph.alignment,
          fontSize: settings.fonts.paragraph.size,
          lineHeight: settings.fonts.paragraph.lineHeight,
          font: settings.fonts.paragraph.family
        });
      }

      for (const subChapter of chapter.subChapters) {
        if (currentY > pageHeight - marginBottom - 20) {
          addPageNumber(chapter.type === 'frontmatter' || chapter.type === 'toc');
          doc.addPage();
          currentY = marginTop;
        }

        doc.setFont(settings.fonts.subtitle.family);
        doc.setFontSize(settings.fonts.subtitle.size);
        doc.text(subChapter.title, marginLeft, currentY, {
          align: 'left',
          maxWidth: contentWidth
        });

        currentY += settings.fonts.subtitle.lineHeight * settings.fonts.subtitle.size * 0.352778;

        const subParagraphs = subChapter.content.split('\n\n').filter(p => p.trim());
        for (const paragraph of subParagraphs) {
          if (currentY > pageHeight - marginBottom - 20) {
            addPageNumber(chapter.type === 'frontmatter' || chapter.type === 'toc');
            doc.addPage();
            currentY = marginTop;
          }

          currentY = parsePDFMarkdown(doc, paragraph, marginLeft + (chapter.indentation * 10), currentY, {
            maxWidth: contentWidth - (chapter.indentation * 10),
            align: settings.fonts.paragraph.alignment,
            fontSize: settings.fonts.paragraph.size,
            lineHeight: settings.fonts.paragraph.lineHeight,
            font: settings.fonts.paragraph.family
          });
        }
      }

      addPageNumber(chapter.type === 'frontmatter' || chapter.type === 'toc');
    }

    return new Blob([doc.output('arraybuffer')], { type: 'application/pdf' });
  }
}));