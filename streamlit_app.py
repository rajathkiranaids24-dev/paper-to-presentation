
import streamlit as st

st.set_page_config(
    page_title="Paper to Presentation",
    page_icon="📄",
    layout="wide"
)

st.title("📄 Paper to Presentation")
st.subheader("Transform research papers into presentations using AI")

uploaded_file = st.file_uploader(
    "Upload your research paper",
    type=["pdf"]
)

if uploaded_file:
    st.success(f"Uploaded: {uploaded_file.name}")

    if st.button("Generate Presentation"):
        st.info("Connect your existing AI processing and slide generation agents here.")

