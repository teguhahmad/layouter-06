import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js`;

export async function extractTableOfContents(pdfBytes: ArrayBuffer) {
  try {
    const pagesText = await loadPDF(pdfBytes);
    return processTableOfContents(pagesText);
  } catch (error) {
    console.error('Error extracting table of contents:', error);
    throw new Error('Gagal mengekstrak daftar isi dari PDF');
  }
}

async function loadPDF(pdfData: ArrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const numPages = pdf.numPages;
  const pagesText = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join('\n');
    pagesText.push(pageText);
  }

  return pagesText;
}

function processTableOfContents(pagesText: string[]) {
  const tableOfContents = [];
  const seenHeadings = new Set();
  const babPattern = /Bab \d+[:\s]?.*/gi;
  const subbabPattern = /\d+\.\d+[:\s]?.*/gi;
  const specialSectionPattern = /(Kata Pengantar|Daftar Isi)/gi;
  const romanNumerals = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"];
  let pageCounter = 0;
  let isMainContentStarted = false;
  let romanIndex = 0;

  pagesText.forEach((text, pageIndex) => {
    if (!isMainContentStarted && /Bab 1/i.test(text)) {
      isMainContentStarted = true;
      pageCounter = 1;
    }

    const lines = text.split('\n');
    lines.forEach(line => {
      const specialMatch = line.match(specialSectionPattern);
      if (specialMatch) {
        const specialHeading = specialMatch[0].trim();
        if (!seenHeadings.has(specialHeading)) {
          const romanPage = romanNumerals[romanIndex] || String(romanIndex + 1);
          tableOfContents.push({
            type: 'frontmatter',
            title: specialHeading,
            content: `${specialHeading} - Halaman ${romanPage}`,
            pageNumber: romanPage
          });
          seenHeadings.add(specialHeading);
          romanIndex++;
        }
      }

      const babMatch = line.match(babPattern);
      if (babMatch) {
        const babHeading = babMatch[0].trim();
        if (!seenHeadings.has(babHeading)) {
          const nextLine = lines[lines.indexOf(line) + 1];
          const babTitle = nextLine ? nextLine.trim() : '';
          if (isMainContentStarted) {
            tableOfContents.push({
              type: 'chapter',
              title: babTitle,
              content: `BAB ${tableOfContents.length + 1} : ${babTitle}`,
              pageNumber: pageCounter
            });
            seenHeadings.add(babHeading);
          }
        }
      }

      const subbabMatch = line.match(subbabPattern);
      if (subbabMatch) {
        const subbabHeading = subbabMatch[0].trim();
        if (!seenHeadings.has(subbabHeading) && isMainContentStarted) {
          tableOfContents.push({
            type: 'subchapter',
            title: subbabHeading,
            content: `${subbabHeading} - Halaman ${pageCounter}`,
            pageNumber: pageCounter
          });
          seenHeadings.add(subbabHeading);
        }
      }
    });

    if (isMainContentStarted) {
      pageCounter++;
    }
  });

  return tableOfContents;
}