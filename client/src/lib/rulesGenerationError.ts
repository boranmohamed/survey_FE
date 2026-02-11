/**
 * Custom error class for rules generation validation errors (HTTP 422).
 * 
 * This error is thrown when the rules generation API returns a 422 status,
 * indicating that the request couldn't generate valid rules.
 * This is not treated as a console error - it's a user-facing validation issue.
 */
export class RulesGenerationValidationError extends Error {
  readonly statusCode: number = 422;

  constructor(message: string = "Couldn't generate valid rules. Try rephrasing your request.") {
    super(message);
    this.name = "RulesGenerationValidationError";
  }
}

