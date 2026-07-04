function createKeywords(word: string) {
  const words: string[] = [];
  let currentWord = "";
  word.split("").forEach((letter) => {
    currentWord += letter;
    words.push(currentWord);
  });

  return words;
}

export function generateKeywords(name: string) {
  const formatedName = name.toLowerCase();
  const keywordFullName = createKeywords(formatedName);
  const keywordLastWordFirst = createKeywords(
    `${formatedName.substring(formatedName.lastIndexOf(" ")).replace(" ", "")} ${formatedName.substring(0, formatedName.lastIndexOf(" ") - 1)}`,
  );

  return [...new Set(["", ...keywordFullName, ...keywordLastWordFirst])];
}
