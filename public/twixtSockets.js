//PAGINATION

// $('#pagination-demo').twbsPagination(
// {
//     totalPages: 16,
//     visiblePages: 6,
//     next: 'Next',
//     prev: 'Prev',
//     onPageClick: function (event, page)
//     {
//         //fetch content and render here
//         $('#page-content').text('Page ' + page) + ' content here';
//     }
// });

//Functinos to run when page loads
$(document).ready(function() {
  $("#categorySelect").on("change", function() {
    $("#categoryForm").submit();
  });

  $(".messageForm").on("keyup", function(e) {
    if (e.keyCode === 13) {
      e.preventDefault();
      $("#messageSubmit").click();
    }
  });
});
