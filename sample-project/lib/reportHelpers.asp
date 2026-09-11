<%
' Helpers for reports.asp only. Defines a second, unrelated Helper() so F12
' on that name (from somewhere that can't reach either implementation via
' includes) shows a picker with two candidates once both admin.asp and
' reports.asp have been opened — see index.asp's comments and the README's
' "Indexing modes" section.

Function Helper()
  Helper = "report helper"
End Function
%>
