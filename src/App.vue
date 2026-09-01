<template>
  <img id="portrait" alt="Portrait" src="./assets/portrait.jpg" />
  <SafeFlightHGSchool msg="Welcome to the SafeFlight Hang Gliding School!" />
</template>

<script>
import SafeFlightHGSchool from "./components/SafeFlightHGSchool.vue";

export default {
  name: "App",
  components: {
    SafeFlightHGSchool,
  },
};
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}

#portrait {
  border-radius: 25px;
  filter: drop-shadow(0 0 0.2rem gray);
}
</style>
