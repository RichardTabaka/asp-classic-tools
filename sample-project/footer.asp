<!-- #include file="header.asp" -->
<%
' header.asp and footer.asp include each other on purpose here, to
' demonstrate the include tree's cycle detection (Outline 5).
Sub RenderFooter()
  Response.Write "<footer>&copy; Acme</footer>"
End Sub
%>
