/**
 * Answer synthesis for agent chat.
 * Builds a standalone natural-language answer from intent + confidence check.
 * NEVER concatenates raw snippet text into the answer string.
 */
export function synthesizeAnswer(
  intent: string,
  hasContent: boolean,
  contexts: Array<{ document_title: string }>,
): string {
  const bestTitle = contexts[0]?.document_title;

  if (!hasContent) {
    const base = "I could not find enough detail in the sources to fully answer your question.";
    if (bestTitle) {
      return `${base} I suggest reading "${bestTitle}" for more information.`;
    }
    return `${base} Please check the relevant page linked below.`;
  }

  switch (intent) {
    case "ownership": {
      return (
        "At the end of the Launch Program, you own the code, infrastructure, content, " +
        "and systems built for your company. Vispaico presents the program as a full " +
        "handover rather than an ongoing dependency."
      );
    }

    case "pricing": {
      return (
        "The best page to read is the Launch Program page. " +
        "It explains the $24,800 / 6 month offer and breaks down what is included."
      );
    }

    case "contact": {
      return (
        "The best next step is to contact Vispaico directly or book a call through the contact page."
      );
    }

    case "services": {
      return (
        "Vispaico offers studio and consulting services to help companies build and ship products faster. " +
        "The Services page has the full breakdown."
      );
    }

    case "process":
    case "faq": {
      return (
        "The FAQ page covers this topic in detail. " +
        "Based on what we retrieved, the main points are explained on the site."
      );
    }

    case "about": {
      return (
        "Vispaico was founded to help companies move fast and build great products. " +
        "The About page has more on the company, team, and mission."
      );
    }

    default: {
      if (bestTitle) {
        return `I found relevant information in "${bestTitle}". Please visit the page for the full details.`;
      }
      return "I found relevant information. Please check the pages linked below for details.";
    }
  }
}
