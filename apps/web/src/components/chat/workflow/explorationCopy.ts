export function toCompactExplorationTitle(
  toolName: string,
  title: string,
): string {
  switch (toolName) {
    case "read_file":
      return title.replace(/^Reading /, "Read ");
    case "list_files":
      return title.replace(/^Listing /, "List ");
    case "grep":
    case "search_code":
      return title
        .replace(/^Searching for /, "Search ")
        .replace(/^Searched for /, "Search ")
        .replace(/^Searching /, "Search ")
        .replace(/^Searched /, "Search ");
    case "glob":
      return title.replace(/^Finding /, "Find ");
    default:
      return title;
  }
}
