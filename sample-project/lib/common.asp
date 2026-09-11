<%
' Shared helpers used across the site.

Function FormatDate(d)
  FormatDate = Year(d) & "-" & Month(d) & "-" & Day(d)
End Function

Sub LogError(msg)
  ' Rem: not a real logger yet, just a placeholder.
  Response.Write "[error] " & msg
End Sub
%>
