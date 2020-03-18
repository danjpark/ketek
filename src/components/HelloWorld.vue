<template>
  <div class="hello">
    <textarea v-model="message" placeholder="add multiple lines"></textarea>
    <br />
    {{ message }}
    <br />
    {{ reversedMessage }}
  </div>
</template>

<script>
export default {
  name: 'HelloWorld',
  props: {
    message: {
        default: 'Dan Park is King',
        type: String
    }
  },
  computed :{
      reversedMessage () {
        // return this.message.split('').reverse().join('');
        return this.message.split('').join('').split(' ').reverse().join(' ')
    }
  },
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
</style>
