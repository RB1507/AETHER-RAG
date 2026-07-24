import re

def clean_text(text: str) -> str:
    """
    Cleans raw extracted text:
    - Strips null bytes
    - Normalizes multiple horizontal spaces to a single space
    - Removes non-printable control characters (except tabs and newlines)
    - Normalizes soft wraps (newlines not following punctuation) to spaces
    - Preserves newlines following sentence/paragraph boundaries
    """
    if not text:
        return ""

    # 1. Strip null bytes
    text = text.replace("\x00", "")

    # 2. Remove non-printable control characters except \n, \r, \t
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", text)

    # 3. Standardize carriage returns to newlines
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # 4. Normalize multiple horizontal spaces/tabs
    text = text.replace("\t", " ")
    text = re.sub(r"[ \t\xA0\u2000-\u200A]+", " ", text)

    # 5. Clean up surrounding whitespaces of each line
    lines = [line.strip() for line in text.split("\n")]
    
    # Reconstruct with clean newlines
    text = "\n".join(lines)

    # 6. Normalize newlines:
    # - If newlines occur after a sentence terminator (. ! ? :), we keep a single newline.
    # - If newlines occur in the middle of a sentence, we replace them with a single space.
    def replace_newlines(match: re.Match) -> str:
        group = match.group(0)
        # Check the character preceding the newlines
        start_idx = match.start()
        if start_idx > 0:
            prev_char = match.string[start_idx - 1]
            if prev_char in ".!?:":
                return "\n"
        return " "

    text = re.sub(r"\n+", replace_newlines, text)

    # 7. Normalize double spaces that might have been introduced
    text = re.sub(r" +", " ", text)

    return text.strip()
