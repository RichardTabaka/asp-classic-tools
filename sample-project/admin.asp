<!-- #include file="lib/adminHelpers.asp" -->
<%
' A second, separate top-level page. Nothing here is included by index.asp,
' and this file doesn't include index.asp's tree either — but it shares
' lib/common.asp with it, reached through this file's own include chain.

Function Main()
  Dim u
  u = "user-42"
  If IsAdmin(u) Then
    Response.Write "<p>Welcome, admin.</p>"
  End If
  Response.Write FormatDate(Now())   ' shared helper, via this file's own include
End Function
%>
