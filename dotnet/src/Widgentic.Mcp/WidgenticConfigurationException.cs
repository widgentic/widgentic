namespace Widgentic.Mcp;

/// <summary>One configuration entry widgentic refused, with the bundle's structured code.</summary>
/// <param name="Section"><c>widgets</c>, <c>themes</c>, <c>schemas</c> or <c>options</c>.</param>
/// <param name="Source">The file or label the entry came from.</param>
/// <param name="Code">The structured code (for example <c>INVALID_TEMPLATE</c>, <c>RESERVED_KIND</c>).</param>
/// <param name="Message">What is wrong, in the bundle's words.</param>
public sealed record WidgenticConfigurationProblem(string Section, string Source, string Code, string Message);

/// <summary>
/// Thrown at startup when any configured widget, theme or schema is refused: nothing is ever
/// accepted and then silently missing.
/// </summary>
public sealed class WidgenticConfigurationException : Exception
{
    /// <summary>Create the exception for the refused entries.</summary>
    /// <param name="problems">Every refused entry.</param>
    public WidgenticConfigurationException(IReadOnlyList<WidgenticConfigurationProblem> problems)
        : base(Describe(problems))
    {
        Problems = problems;
    }

    /// <summary>Every refused entry.</summary>
    public IReadOnlyList<WidgenticConfigurationProblem> Problems { get; }

    private static string Describe(IReadOnlyList<WidgenticConfigurationProblem> problems) =>
        $"widgentic refused {problems.Count} configuration entr{(problems.Count == 1 ? "y" : "ies")}:" +
        string.Concat(problems.Select(p => $"{Environment.NewLine}  - {p.Section} ({p.Source}): {p.Code} — {p.Message}"));
}
